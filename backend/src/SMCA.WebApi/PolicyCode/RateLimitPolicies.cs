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
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 3,
                QueueLimit = 0
            });

    public static RateLimitPartition<string> Register(HttpContext context)
        => RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(10),
                SegmentsPerWindow = 10,
                QueueLimit = 0
            });
}
