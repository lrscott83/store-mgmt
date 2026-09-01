using Application.Abstractions.Authentication;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace SMCA.WebApi.Authentication
{
    internal sealed class JwtProvider : IJwtProvider
    {
        private readonly JwtOptions _jwtOptions;
        public JwtProvider(IOptions<JwtOptions> jwtOptions) 
        {
            _jwtOptions = jwtOptions.Value;
        }
        public string GenerateToken(Guid userId, string userLogin)
        {
            // Fallback to 35 days if unconfigured/zero — a 0 would mint
            // instantly-expired tokens. Matches the client's offline window.
            var lifetimeDays = _jwtOptions.TokenLifetimeDays > 0 ? _jwtOptions.TokenLifetimeDays : 35;
            return GenerateToken(userId, userLogin, DateTime.UtcNow.AddDays(lifetimeDays));
        }

        public string GenerateToken(Guid userId, string userLogin, DateTime expiresAt)
        {
            var claims = new Claim[] 
            { 
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Name, userLogin),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            };

            // UTF8, matching both validators (JwtBearerOptionsSetup and ServiceExtensions).
            // ASCII agrees with UTF8 only while the key stays ASCII-only; a single accented
            // character in the configured secret would make every issued token fail validation.
            var key = Encoding.UTF8.GetBytes(_jwtOptions.SecretKey);
            var signingCredentials = new SigningCredentials(
                    new SymmetricSecurityKey(key),
                    SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                _jwtOptions.Issuer,
                _jwtOptions.Audience,
                claims,
                null,
                expiresAt,
                signingCredentials);

            string userToken = new JwtSecurityTokenHandler().WriteToken(token);
            return userToken;
        }

        public string GenerateRefreshToken()
        {
            var randomBytes = new byte[32];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(randomBytes);
            return Convert.ToBase64String(randomBytes);
        }
    }
}
