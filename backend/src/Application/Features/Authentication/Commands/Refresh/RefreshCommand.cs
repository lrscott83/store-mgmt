using Application.Abstractions.Authentication;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Results;
using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Net;

namespace Application.Features.Authentication.Commands.Refresh;

public sealed record RefreshCommand(string RefreshToken) : ICommand<AuthDto>;

internal sealed class RefreshCommandHandler : ICommandHandler<RefreshCommand, AuthDto>
{
    private readonly IRefreshTokenRepository _refreshTokenRepository;
    private readonly IJwtProvider _jwtProvider;
    private readonly IUserRepository _userRepository;
    private readonly IStoreRepository _storeRepository;
    private readonly IOwnerRepository _ownerRepository;
    private readonly AuthenticationSettings _authSettings;
    private readonly ILogger<RefreshCommandHandler> _logger;
    private readonly IApplicationUnitOfWork _applicationUnitOfWork;

    public RefreshCommandHandler(
        IRefreshTokenRepository refreshTokenRepository,
        IJwtProvider jwtProvider,
        IUserRepository userRepository,
        IOptions<AuthenticationSettings> authSettings,
        ILogger<RefreshCommandHandler> logger,
        IApplicationUnitOfWork applicationUnitOfWork,
        IStoreRepository storeRepository,
        IOwnerRepository ownerRepository)
    {
        _refreshTokenRepository = refreshTokenRepository;
        _jwtProvider = jwtProvider;
        _userRepository = userRepository;
        _storeRepository = storeRepository;
        _ownerRepository = ownerRepository;
        _authSettings = authSettings.Value;
        _logger = logger;
        _applicationUnitOfWork = applicationUnitOfWork;
    }

    public async Task<ResponseResult<AuthDto>> Handle(RefreshCommand request, CancellationToken cancellationToken)
    {
        try
        {
            // 1. Hash the incoming refresh token and look it up
            var tokenHash = RefreshToken.HashToken(request.RefreshToken);
            var existingToken = await _refreshTokenRepository.GetByTokenHashAsync(tokenHash);

            if (existingToken is null || !existingToken.IsActive)
            {
                return ResponseResult.Failure<AuthDto>(
                    new Error("Auth.InvalidRefreshToken", "Invalid or expired refresh token."),
                    (int)HttpStatusCode.Unauthorized);
            }

            // 2. Look up the user associated with the refresh token. The refresh endpoint is
            // AllowAnonymous: the caller carries no tenant claims, so the tenant query filter on
            // User would hide the token's owner (`GetByIdAsync` -> FindAsync applies the filter).
            // Resolve WITHOUT the tenant filter — same as login's GetByLoginWithRelatedAsync.
            var user = await _userRepository.GetUserByIdIgnoreQueryFiltersAsync(existingToken.UserId.ToString());
            if (user is null)
            {
                return ResponseResult.Failure<AuthDto>(
                    new Error("Auth.UserNotFound", "User not found."),
                    (int)HttpStatusCode.Unauthorized);
            }

            // 2b. Activation-state matrix (store-deactivation-session-revocation):
            // mirror /me's three checks so a deactivation cannot be outlived by
            // token rotation. Unlike /me (which blacklists the caller's access
            // token), refresh has no access token in hand — revoking AND saving
            // the presented refresh token is the enforcement (refresh-token-
            // persistence R4 carve-out: activation-state failures DO save).
            if (!user.IsActive)
                return await RejectAndRevokeAsync(existingToken, "Auth.AccountInactive", "Account is inactive.", cancellationToken);

            if (user.SelectedStoreId != Guid.Empty)
            {
                // Same IgnoreQueryFilters lookups as GetMeQuery: the store may be
                // tenant-hidden or already inactive — both must be visible here.
                var store = await _storeRepository
                    .Where(s => s.Id == user.SelectedStoreId)
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(cancellationToken);

                if (store is not null && !store.IsActive)
                    return await RejectAndRevokeAsync(existingToken, "Store.Inactive", "The store is inactive.", cancellationToken);

                if (store is not null)
                {
                    var owner = await _ownerRepository
                        .Where(o => o.Id == store.OwnerId)
                        .IgnoreQueryFilters()
                        .FirstOrDefaultAsync(cancellationToken);

                    if (owner is not null && !owner.IsActive)
                        return await RejectAndRevokeAsync(existingToken, "Owner.Inactive", "The owner is inactive.", cancellationToken);
                }
            }

            // 3. Generate new access token
            string newAccessToken = _jwtProvider.GenerateToken(user.Id, user.Login);

            // 4. Generate new refresh token (rotation — old one gets revoked)
            string rawRefreshToken = _jwtProvider.GenerateRefreshToken();
            var refreshExpiry = DateTimeOffset.UtcNow.AddDays(_authSettings.RefreshTokenExpirationDays);
            var newRefreshToken = new RefreshToken(user.Id, rawRefreshToken, refreshExpiry);

            // 5. Revoke old refresh token
            existingToken.Revoke(rawRefreshToken);

            // 6. Persist rotation explicitly — do NOT rely on UnitOfWorkBehaviour: it never saves.
            _refreshTokenRepository.Update(existingToken);
            _refreshTokenRepository.Add(newRefreshToken);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(new AuthDto(
                user.Login,
                newAccessToken,
                DateTime.UtcNow.AddDays(_authSettings.TokenLifetimeDays),
                rawRefreshToken,
                refreshExpiry));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Refresh token operation failed");
            var error = new Error("Auth.ServiceError", "An unexpected error occurred. Please try again.");
            return ResponseResult.Failure<AuthDto>(new List<Error> { error }, (int)HttpStatusCode.InternalServerError);
        }
    }

    /// <summary>
    /// Activation-state rejection: 401 with the same domain error codes /me uses,
    /// plus revocation of the presented refresh token so the session cannot
    /// resurrect through rotation. The revocation is saved (R4 carve-out).
    /// </summary>
    private async Task<ResponseResult<AuthDto>> RejectAndRevokeAsync(RefreshToken token, string code, string message, CancellationToken cancellationToken)
    {
        token.Revoke();
        _refreshTokenRepository.Update(token);
        await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
        return ResponseResult.Failure<AuthDto>(
            new Error(code, message),
            (int)HttpStatusCode.Unauthorized);
    }
}
