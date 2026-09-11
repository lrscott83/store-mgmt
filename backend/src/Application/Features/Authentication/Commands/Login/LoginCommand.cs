using Application.Abstractions.Authentication;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Results;
using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Net;

namespace Application.Features.Authentication.Commands.Login
{
    public sealed record LoginCommand(string Login, string Password) : ICommand<AuthDto> { }

    public class LoginCommandHandler : ICommandHandler<LoginCommand, AuthDto>
    {
        private readonly IAuthenticationService _authenticationService;
        private readonly IJwtProvider _jwtProvider;
        private readonly IAuthTokenConfig _authTokenConfig;
        private readonly IRefreshTokenRepository _refreshTokenRepository;
        private readonly AuthenticationSettings _authSettings;
        private readonly ILogger<LoginCommandHandler> _logger;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IUserRepository _userRepository;
        private readonly IOfflinePreHashProtector _preHashProtector;
        private readonly IStoreDataKeyProvider _storeDataKeyProvider;
        private readonly IStoreKeyWrapService _storeKeyWrapService;
        private readonly IStoreRepository _storeRepository;

        public LoginCommandHandler(
            IAuthenticationService authenticationService,
            IJwtProvider jwtProvider,
            IAuthTokenConfig authTokenConfig,
            IRefreshTokenRepository refreshTokenRepository,
            IOptions<AuthenticationSettings> authSettings,
            ILogger<LoginCommandHandler> logger,
            IApplicationUnitOfWork applicationUnitOfWork,
            IUserRepository userRepository,
            IOfflinePreHashProtector preHashProtector,
            IStoreDataKeyProvider storeDataKeyProvider,
            IStoreKeyWrapService storeKeyWrapService,
            IStoreRepository storeRepository)
        {
            _authenticationService = authenticationService;
            _jwtProvider = jwtProvider;
            _authTokenConfig = authTokenConfig;
            _refreshTokenRepository = refreshTokenRepository;
            _authSettings = authSettings.Value;
            _logger = logger;
            _applicationUnitOfWork = applicationUnitOfWork;
            _userRepository = userRepository;
            _preHashProtector = preHashProtector;
            _storeDataKeyProvider = storeDataKeyProvider;
            _storeKeyWrapService = storeKeyWrapService;
            _storeRepository = storeRepository;
        }

        public async Task<ResponseResult<AuthDto>> Handle(LoginCommand request, CancellationToken cancellationToken)
        {
            try
            {
                var authResult = await _authenticationService.IsValidUserAsync(request.Login, request.Password);
                if (!authResult.Succeeded || authResult.Data == default)
                {
                    int actionCode = MapErrorToStatusCode(authResult.Errors);
                    return ResponseResult.Failure<AuthDto>(authResult.Errors, actionCode);
                }

                string accessToken = _jwtProvider.GenerateToken(authResult.Data, request.Login);

                // Generate and persist refresh token
                string rawRefreshToken = _jwtProvider.GenerateRefreshToken();
                var refreshExpiry = DateTimeOffset.UtcNow.AddDays(_authSettings.RefreshTokenExpirationDays);
                var refreshToken = new RefreshToken(authResult.Data, rawRefreshToken, refreshExpiry);
                _refreshTokenRepository.Add(refreshToken);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

                var (wrappedDek, wrapSalt, wrapIv, storeDekWraps) = await TryBuildLoginDekWrapsAsync(authResult.Data, cancellationToken);

                return ResponseResult.Success(new AuthDto(
                    request.Login,
                    accessToken,
                    DateTime.UtcNow.AddDays(_authTokenConfig.TokenLifetimeDays),
                    rawRefreshToken,
                    refreshExpiry,
                    wrappedDek,
                    wrapSalt,
                    wrapIv,
                    storeDekWraps));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Login failed for {Login}", request.Login);
                var error = new Error("Auth.ServiceError", "An unexpected error occurred. Please try again.");
                return ResponseResult.Failure<AuthDto>(new List<Error> { error }, (int)HttpStatusCode.InternalServerError);
            }
        }

        /// <summary>
        /// Builds the store DEK wraps for the login response, wrapped with the user's
        /// decrypted offline password pre-hash — roster-compatible
        /// (ExportOfflineRosterQuery.cs:118-120). Called after
        /// <see cref="IAuthenticationService.IsValidUserAsync"/> so the pre-hash backfill
        /// has already persisted. Any degradation (missing user, missing pre-hash, no
        /// selected store, Unprotect/WrapDek throwing) yields empty fields and an empty
        /// list: login never fails.
        ///
        /// The response carries a wrap for EVERY store the user can switch to — the
        /// selected store (top-level fields AND first list entry, so legacy clients and
        /// the new per-store consumer see the same wrap) plus the owner's other active
        /// stores. The per-store list is what lets the frontend provision a per-store
        /// device wrap table at login and switch stores in-session later, with no
        /// password and no logout (the client holds no password after login, so switch
        /// time can never unwrap anything — provisioning MUST happen here).
        /// </summary>
        private async Task<(string WrappedDek, string WrapSalt, string WrapIv, List<StoreDekWrapDto>? StoreDekWraps)>
            TryBuildLoginDekWrapsAsync(Guid userId, CancellationToken cancellationToken)
        {
            try
            {
                // Login is AllowAnonymous and the pre-hash backfill inside IsValidUserAsync writes
                // via ExecuteUpdateAsync while ApplicationDbContext is NoTracking — the entity
                // loaded during validation has a STALE OfflinePasswordPreHash. A fresh, filter-free
                // query is mandatory (RefreshCommand.cs:61 precedent).
                var user = await _userRepository.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString());
                if (user is null)
                    return ("", "", "", null);

                string? preHash = _preHashProtector.Unprotect(user.OfflinePasswordPreHash, user.Id);
                if (preHash is null || user.SelectedStoreId == Guid.Empty)
                    return ("", "", "", null);

                // The IgnoreQueryFilters variant is mandatory here: login is AllowAnonymous,
                // so the store's tenant filter (StoreEntityTypeConfiguration: IsSuperAdmin ||
                // TenantId == context.TenantId) evaluates with no tenant in context and would
                // hide every store — the same reason the user re-query above is filter-free.
                var ownerStores = await _storeRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(
                    user.Id);

                // Every store this login can wrap: the SELECTED store first — the legacy
                // top-level fields below bind to the FIRST wrap, so the selected store must
                // always come first — then the owner's other active stores (SuperAdmin
                // operating a store, or a store user with their own selected store, are
                // covered by the selected-store pin; duplicates are skipped).
                var storeIds = new List<Guid>();
                storeIds.Add(user.SelectedStoreId);
                foreach (var ownedStore in ownerStores)
                {
                    if (ownedStore.Id != user.SelectedStoreId && storeIds.All(s => s != ownedStore.Id))
                        storeIds.Add(ownedStore.Id);
                }

                var wraps = new List<StoreDekWrapDto>(storeIds.Count);
                string firstWrappedDek = "", firstWrapSalt = "", firstWrapIv = "";
                foreach (var storeId in storeIds)
                {
                    // Per-store isolation: one store failing to wrap (deleted mid-login,
                    // HKDF/key-provider hiccup) skips that entry only — the rest of the
                    // list and the login itself proceed (same R4 discipline as the old
                    // whole-method catch).
                    try
                    {
                        byte[] dek = _storeDataKeyProvider.GetDek(storeId);
                        WrappedDekResult wrapped = _storeKeyWrapService.WrapDek(preHash, dek);
                        wraps.Add(new StoreDekWrapDto(
                            storeId.ToString(),
                            wrapped.WrappedDek,
                            wrapped.WrapSalt,
                            wrapped.WrapIv));
                        if (firstWrappedDek.Length == 0)
                        {
                            // Legacy top-level fields stay bound to the SELECTED store's wrap
                            // (consumers before the per-store list assume exactly that), so the
                            // selected store is pinned first in storeIds above whenever it wraps.
                            firstWrappedDek = wrapped.WrappedDek;
                            firstWrapSalt = wrapped.WrapSalt;
                            firstWrapIv = wrapped.WrapIv;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "Failed to build per-store DEK wrap for store {StoreId} (user {UserId}); skipping it",
                            storeId, userId);
                    }
                }

                if (wraps.Count == 0)
                    return ("", "", "", null);

                return (firstWrappedDek, firstWrapSalt, firstWrapIv, wraps);
            }
            catch (Exception ex)
            {
                // Never let a wrap failure reach the handler's outer catch — that returns 500
                // and violates "login never fails" (spec auth-login-wrapped-dek R4).
                _logger.LogWarning(ex, "Failed to build login DEK wraps for {UserId}; returning empty wrap fields", userId);
                return ("", "", "", null);
            }
        }

        private static int MapErrorToStatusCode(List<Error> errors)
        {
            if (errors is null || errors.Count == 0)
                return (int)HttpStatusCode.BadRequest;

            foreach (var error in errors)
            {
                if (error is null) continue;

                // AccountInactive and Store.Inactive map to 403 Forbidden
                if (error.Code is "Auth.AccountInactive" or "Store.Inactive")
                    return (int)HttpStatusCode.Forbidden;

                // InvalidCredentials map to 401 Unauthorized
                if (error.Code is "Auth.InvalidCredentials")
                    return (int)HttpStatusCode.Unauthorized;
            }

            return (int)HttpStatusCode.BadRequest;
        }
    }
}
