using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Common.Results;
using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Logging;
using System.Net;

namespace Application.Features.Authentication.Commands.Revoke;

public sealed record RevokeCommand(string? RefreshToken) : ICommand<bool>;

internal sealed class RevokeCommandHandler : ICommandHandler<RevokeCommand, bool>
{
    private readonly IRefreshTokenRepository _refreshTokenRepository;
    private readonly IHttpContextService _httpContextService;
    private readonly ILogger<RevokeCommandHandler> _logger;

    public RevokeCommandHandler(
        IRefreshTokenRepository refreshTokenRepository,
        IHttpContextService httpContextService,
        ILogger<RevokeCommandHandler> logger)
    {
        _refreshTokenRepository = refreshTokenRepository;
        _httpContextService = httpContextService;
        _logger = logger;
    }

    public async Task<ResponseResult<bool>> Handle(RevokeCommand request, CancellationToken cancellationToken)
    {
        try
        {
            if (!string.IsNullOrEmpty(request.RefreshToken))
            {
                // Revoke a specific refresh token
                var tokenHash = RefreshToken.HashToken(request.RefreshToken);
                var token = await _refreshTokenRepository.GetByTokenHashAsync(tokenHash);

                if (token is not null && !token.IsRevoked)
                {
                    token.Revoke();
                    _refreshTokenRepository.Update(token);
                }

                return ResponseResult.Success(true);
            }
            else
            {
                // Revoke all active tokens for the current user
                var userId = _httpContextService.UserExternalId.ToGuid();
                var activeTokens = await _refreshTokenRepository.GetActiveByUserIdAsync(userId);

                foreach (var token in activeTokens)
                {
                    token.Revoke();
                    _refreshTokenRepository.Update(token);
                }

                return ResponseResult.Success(true);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Revoke token operation failed");
            var error = new Error("Auth.ServiceError", "An unexpected error occurred. Please try again.");
            return ResponseResult.Failure<bool>(new List<Error> { error }, (int)HttpStatusCode.InternalServerError);
        }
    }
}
