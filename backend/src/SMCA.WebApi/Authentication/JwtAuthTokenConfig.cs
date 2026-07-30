using Application.Abstractions.Authentication;
using Microsoft.Extensions.Options;

namespace SMCA.WebApi.Authentication
{
    internal sealed class JwtAuthTokenConfig : IAuthTokenConfig
    {
        private readonly JwtOptions _options;

        public JwtAuthTokenConfig(IOptions<JwtOptions> options)
        {
            _options = options.Value;
        }

        public int TokenLifetimeDays => _options.TokenLifetimeDays > 0 ? _options.TokenLifetimeDays : 35;
    }
}