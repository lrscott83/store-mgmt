namespace SMCA.WebApi.Authentication
{
    public class JwtOptions
    {
        public string Issuer { get; init; }
        public string Audience { get; init; }
        public string SecretKey { get; init; }

        // Access-token lifetime in days. Long by design: the POS is offline-first
        // and the clients keep a local session for ~35 days, so the JWT must
        // outlive that window (a short server token 401s while the client still
        // considers itself authenticated). Configured in appsettings' "Jwt" section.
        public int TokenLifetimeDays { get; init; }
    }
}
