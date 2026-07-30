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

        public LoginCommandHandler(
            IAuthenticationService authenticationService,
            IJwtProvider jwtProvider,
            IAuthTokenConfig authTokenConfig,
            IRefreshTokenRepository refreshTokenRepository,
            IOptions<AuthenticationSettings> authSettings,
            ILogger<LoginCommandHandler> logger)
        {
            _authenticationService = authenticationService;
            _jwtProvider = jwtProvider;
            _authTokenConfig = authTokenConfig;
            _refreshTokenRepository = refreshTokenRepository;
            _authSettings = authSettings.Value;
            _logger = logger;
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

                return ResponseResult.Success(new AuthDto(
                    request.Login,
                    accessToken,
                    DateTime.UtcNow.AddDays(_authTokenConfig.TokenLifetimeDays),
                    rawRefreshToken,
                    refreshExpiry));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Login failed for {Login}", request.Login);
                var error = new Error("Auth.ServiceError", "An unexpected error occurred. Please try again.");
                return ResponseResult.Failure<AuthDto>(new List<Error> { error }, (int)HttpStatusCode.InternalServerError);
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
