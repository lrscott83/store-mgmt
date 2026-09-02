using Application.Abstractions.Authentication;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace WebApiTest.Authentication
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
            return GenerateToken(userId, userLogin, DateTime.UtcNow.AddHours(1));
        }

        public string GenerateToken(Guid userId, string userLogin, DateTime expiresAt)
        {
            var claims = new Claim[] 
            { 
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Name, userLogin),
            };

            var key = Encoding.ASCII.GetBytes(_jwtOptions.SecretKey);
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
    }
}
