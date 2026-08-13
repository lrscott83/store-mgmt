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
            IStoreKeyWrapService storeKeyWrapService)
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

                var (wrappedDek, wrapSalt, wrapIv) = await TryBuildLoginDekWrapAsync(authResult.Data, cancellationToken);

                return ResponseResult.Success(new AuthDto(
                    request.Login,
                    accessToken,
                    DateTime.UtcNow.AddDays(_authTokenConfig.TokenLifetimeDays),
                    rawRefreshToken,
                    refreshExpiry,
                    wrappedDek,
                    wrapSalt,
                    wrapIv));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Login failed for {Login}", request.Login);
                var error = new Error("Auth.ServiceError", "An unexpected error occurred. Please try again.");
                return ResponseResult.Failure<AuthDto>(new List<Error> { error }, (int)HttpStatusCode.InternalServerError);
            }
        }

        /// <summary>
        /// Builds the store DEK wrapped with the user's decrypted offline password pre-hash for
        /// the login response — roster-compatible (ExportOfflineRosterQuery.cs:118-120). Called
        /// after <see cref="IAuthenticationService.IsValidUserAsync"/> so the pre-hash backfill
        /// has already persisted. Any degradation (missing user, missing pre-hash, no selected
        /// store, Unprotect/WrapDek throwing) yields an empty tuple: login never fails.
        /// </summary>
        private async Task<(string WrappedDek, string WrapSalt, string WrapIv)> TryBuildLoginDekWrapAsync(Guid userId, CancellationToken cancellationToken)
        {
            try
            {
                // Login is AllowAnonymous and the pre-hash backfill inside IsValidUserAsync writes
                // via ExecuteUpdateAsync while ApplicationDbContext is NoTracking — the entity
                // loaded during validation has a STALE OfflinePasswordPreHash. A fresh, filter-free
                // query is mandatory (RefreshCommand.cs:61 precedent).
                var user = await _userRepository.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString());
                if (user is null)
                    return ("", "", "");

                string? preHash = _preHashProtector.Unprotect(user.OfflinePasswordPreHash, user.Id);
                if (preHash is null || user.SelectedStoreId == Guid.Empty)
                    return ("", "", "");

                byte[] dek = _storeDataKeyProvider.GetDek(user.SelectedStoreId);
                WrappedDekResult wrapped = _storeKeyWrapService.WrapDek(preHash, dek);
                return (wrapped.WrappedDek, wrapped.WrapSalt, wrapped.WrapIv);
            }
            catch (Exception ex)
            {
                // Never let a wrap failure reach the handler's outer catch — that returns 500
                // and violates "login never fails" (spec auth-login-wrapped-dek R4).
                _logger.LogWarning(ex, "Failed to build login DEK wrap for {UserId}; returning empty wrap fields", userId);
                return ("", "", "");
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
