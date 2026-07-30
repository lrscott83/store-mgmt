using Application.Abstractions.Authentication;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Domain.Common.Results;
using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
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
    private readonly AuthenticationSettings _authSettings;
    private readonly ILogger<RefreshCommandHandler> _logger;

    public RefreshCommandHandler(
        IRefreshTokenRepository refreshTokenRepository,
        IJwtProvider jwtProvider,
        IUserRepository userRepository,
        IOptions<AuthenticationSettings> authSettings,
        ILogger<RefreshCommandHandler> logger)
    {
        _refreshTokenRepository = refreshTokenRepository;
        _jwtProvider = jwtProvider;
        _userRepository = userRepository;
        _authSettings = authSettings.Value;
        _logger = logger;
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

            // 2. Look up the user associated with the refresh token
            var user = await _userRepository.GetByIdAsync(existingToken.UserId);
            if (user is null)
            {
                return ResponseResult.Failure<AuthDto>(
                    new Error("Auth.UserNotFound", "User not found."),
                    (int)HttpStatusCode.Unauthorized);
            }

            // 3. Generate new access token
            string newAccessToken = _jwtProvider.GenerateToken(user.Id, user.Login);

            // 4. Generate new refresh token (rotation — old one gets revoked)
            string rawRefreshToken = _jwtProvider.GenerateRefreshToken();
            var refreshExpiry = DateTimeOffset.UtcNow.AddDays(_authSettings.RefreshTokenExpirationDays);
            var newRefreshToken = new RefreshToken(user.Id, rawRefreshToken, refreshExpiry);

            // 5. Revoke old refresh token
            existingToken.Revoke(rawRefreshToken);

            // 6. Persist changes (saved by UnitOfWorkBehaviour pipeline)
            _refreshTokenRepository.Update(existingToken);
            _refreshTokenRepository.Add(newRefreshToken);

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
}
