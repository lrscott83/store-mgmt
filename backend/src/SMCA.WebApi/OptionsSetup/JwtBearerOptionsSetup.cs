using Application.Abstractions.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using SMCA.WebApi.Authentication;

namespace SMCA.WebApi.OptionsSetup
{
    public class JwtBearerOptionsSetup : IConfigureOptions<JwtBearerOptions>
    {
        private readonly JwtOptions _jwtOptions;
        private readonly IWebHostEnvironment _environment;

        public JwtBearerOptionsSetup(IOptions<JwtOptions> jwtOptions, IWebHostEnvironment environment)
        {
            _jwtOptions = jwtOptions.Value;
            _environment = environment;
        }

        public void Configure(JwtBearerOptions options)
        {
            // Outside development this tells a caller *why* token validation failed.
            options.IncludeErrorDetails = _environment.IsDevelopment();
            options.TokenValidationParameters = new()
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _jwtOptions.Issuer,
                ValidAudience = _jwtOptions.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(_jwtOptions.SecretKey))
            };

            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = async context =>
                {
                    var jti = context.Principal?.Claims?
                        .FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti)?.Value;

                    if (!string.IsNullOrEmpty(jti))
                    {
                        var blacklistService = context.HttpContext.RequestServices
                            .GetRequiredService<ITokenBlacklistService>();
                        if (await blacklistService.IsBlacklistedAsync(jti))
                        {
                            context.Fail("Token has been revoked");
                        }
                    }
                }
            };
        }
    }
}
