using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using System.IdentityModel.Tokens.Jwt;

namespace Application.Features.Authentication.Queries.Logout
{
    public sealed record LogoutQuery() : IQuery<bool> {}

    public class LogoutQueryHandler : IQueryHandler<LogoutQuery, bool>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly ITokenBlacklistService _tokenBlacklistService;

        public LogoutQueryHandler(
            IHttpContextService httpContextService,
            ITokenBlacklistService tokenBlacklistService)
        {
            _httpContextService = httpContextService;
            _tokenBlacklistService = tokenBlacklistService;
        }

        public async Task<ResponseResult<bool>> Handle(LogoutQuery request, CancellationToken cancellationToken)
        {
            // Blacklist the JWT if present, so it cannot be used again
            var accessToken = _httpContextService.AccessToken;
            if (!string.IsNullOrEmpty(accessToken))
            {
                try
                {
                    var handler = new JwtSecurityTokenHandler();
                    var jsonToken = handler.ReadJwtToken(accessToken);
                    var jti = jsonToken.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti)?.Value;

                    if (!string.IsNullOrEmpty(jti))
                    {
                        var expClaim = jsonToken.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Exp)?.Value;
                        if (!string.IsNullOrEmpty(expClaim) && long.TryParse(expClaim, out var expSeconds))
                        {
                            var expDate = DateTimeOffset.FromUnixTimeSeconds(expSeconds);
                            var remaining = expDate - DateTimeOffset.UtcNow;
                            if (remaining > TimeSpan.Zero)
                                await _tokenBlacklistService.BlacklistAsync(jti, remaining);
                            else
                                await _tokenBlacklistService.BlacklistAsync(jti, TimeSpan.Zero);
                        }
                    }
                }
                catch
                {
                    // Malformed token — skip blacklisting
                }
            }

            // Sign out (remove auth cookies/headers on response)
            await _httpContextService.SignOutAsync();

            return ResponseResult.Success(true);
        }
    }
}
