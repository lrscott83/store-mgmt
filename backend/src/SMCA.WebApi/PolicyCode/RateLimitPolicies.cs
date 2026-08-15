using Microsoft.AspNetCore.Http;
using System.Threading.RateLimiting;

namespace SMCA.WebApi.PolicyCode;

/// <summary>
/// Factory methods for the API rate-limit partitions. Extracted verbatim from
/// Program.cs (additive rate-limiter registration) so the configured options
/// and partition keys can be unit-tested. Behavior is identical to the inline
/// policies; the limiter remains disabled under the "Testing" environment
/// (registration still lives behind the !IsEnvironment("Testing") guard).
/// </summary>
public static class RateLimitPolicies
{
    public static RateLimitPartition<string> Login(HttpContext context)
        => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                // Raised 10 -> 15 (user decision 2026-08-15): the E2E suite's
                // real logins cluster within a minute under full parallel load
                // (persona mints + live-login tests), tripping the old limit and
                // failing login-heavy tests intermittently with 429s.
                PermitLimit = 15,
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 3,
                QueueLimit = 0
            });

    public static RateLimitPartition<string> Register(HttpContext context)
        => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                // Raised 10 -> 50 (user decision 2026-08-15): the E2E suite grew past
                // the old 10-per-window budget (register.spec + persona mints + roster
                // recovery ≈ 8-10 registrations per run), so repeated full runs tripped
                // the limiter. SegmentsPerWindow stays 10 -> each 1-min segment
                // replenishes 5 permits.
                PermitLimit = 50,
                Window = TimeSpan.FromMinutes(10),
                SegmentsPerWindow = 10,
                QueueLimit = 0
            });
}
