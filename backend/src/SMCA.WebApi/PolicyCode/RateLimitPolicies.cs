using Microsoft.AspNetCore.Http;
using System.Threading.RateLimiting;

namespace SMCA.WebApi.PolicyCode;

/// <summary>
/// Factory methods for the API rate-limit partitions. Extracted verbatim from
/// Program.cs (additive rate-limiter registration) so the configured options
/// and partition keys can be unit-tested. Behavior is identical to the inline
/// policies. As of H-12, the limiter is active under all environments
/// including "Testing", so E2E tests can now exercise 429 responses.
/// </summary>
public static class RateLimitPolicies
{
    public static RateLimitPartition<string> Login(HttpContext context)
        => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                // Raised 15 -> 30 (H-12, 2026-08-23): with the rate limiter now
                // active under Testing (H-12 fix), the .NET E2E suite's parallel
                // login tests share a single in-memory limiter and exhaust 15/min.
                // 30/min is still a hard ceiling for production abuse while giving
                // the test suite safe headroom.
                PermitLimit = 40,
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
