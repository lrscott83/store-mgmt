using Asp.Versioning;
using Application.Abstractions.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using SMCA.WebApi.OptionsSetup;

namespace SMCA.WebApi.Extensions
{
    public static class ServiceExtensions
    {
        public static void AddLocalizationExtension(this IServiceCollection services)
        {
            services.AddLocalization(options => options.ResourcesPath = "Localization");
        }
        public static void AddJwtAuthenticationExtension(this IServiceCollection services, WebApplicationBuilder builder)
        {
            services.ConfigureOptions<JwtOptionsSetup>();

            services.ConfigureOptions<JwtBearerOptionsSetup>();
            //These will eventually be moved to a secrets file, but for alpha development appsettings is fine
            var validIssuer = builder.Configuration.GetValue<string>("Jwt:Issuer");
            var validAudience = builder.Configuration.GetValue<string>("Jwt:Audience");
            var symmetricSecurityKey = builder.Configuration.GetValue<string>("Jwt:SecretKey");

            builder.Services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
            })
                .AddJwtBearer(options =>
                {
                    options.IncludeErrorDetails = true;
                    options.TokenValidationParameters = new TokenValidationParameters()
                    {
                        ClockSkew = TimeSpan.Zero,
                        ValidateIssuer = true,
                        ValidateAudience = true,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,
                        ValidIssuer = validIssuer,
                        ValidAudience = validAudience,
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(symmetricSecurityKey)),
                    };
                    options.Events = new JwtBearerEvents
                    {
                        OnAuthenticationFailed = async (context) =>
                        {
                            Console.WriteLine("Printing in the delegate OnAuthFailed");
                        },
                        OnTokenValidated = async (context) =>
                        {
                            // Blacklist enforcement: reject a token whose jti was already
                            // revoked (logout / inactive-account /auth/me) BEFORE the action
                            // executes. Lives here, not in JwtBearerOptionsSetup, because the
                            // bearer handler uses the named "Bearer" options — the setup's
                            // OnTokenValidated was silently dropped by the AddJwtBearer lambda.
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
                        },
                        OnChallenge = async (context) =>
                        {
                            Console.WriteLine("Printing in the delegate OnChallenge");

                            context.Response.StatusCode = 401;

                            await context.HttpContext.Response.WriteAsync(
                                context.AuthenticateFailure != null
                                    ? "Token Validation Has Failed. Request Access Denied"
                                    : "Authentication required. No token provided.");

                            context.HandleResponse();
                        }
                    };
                });
        }

        public static void AddApiVersioningExtension(this IServiceCollection services)
        {
            services.AddApiVersioning(config =>
            {
                // Specify the default API Version as 1.0
                config.DefaultApiVersion = new ApiVersion(1, 0);
                // If the client hasn't specified the API version in the request, use the default API version number 
                config.AssumeDefaultVersionWhenUnspecified = true;
                // Advertise the API versions supported for the particular endpoint
                config.ReportApiVersions = true;
            });
        }

        public static void UseLocalizationExtension(this IApplicationBuilder app)
        {
            var cultures = new List<CultureInfo>
            {
                new CultureInfo("es"),
                new CultureInfo("en")
            };

            app.UseRequestLocalization(options =>
            {
                options.DefaultRequestCulture = new Microsoft.AspNetCore.Localization.RequestCulture("es");
                options.SupportedCultures = cultures;
                options.SupportedUICultures = cultures;
            });
        }
    }
}
