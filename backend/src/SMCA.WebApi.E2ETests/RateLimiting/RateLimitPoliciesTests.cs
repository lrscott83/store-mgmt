using System.Net;
using System.Reflection;
using System.Threading.RateLimiting;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using SMCA.WebApi.PolicyCode;
using Xunit;

namespace SMCA.WebApi.E2ETests.RateLimiting;

public class RateLimitPoliciesTests
{
    private static HttpContext ContextWithIp(string? ip)
    {
        var context = new DefaultHttpContext();
        if (ip is not null)
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        }

        return context;
    }

    private static SlidingWindowRateLimiter BuildLimiter(RateLimitPartition<string> partition)
        => (SlidingWindowRateLimiter)partition.Factory(partition.PartitionKey);

    private static SlidingWindowRateLimiterOptions OptionsOf(RateLimitPartition<string> partition)
    {
        // The BCL exposes no public options accessor on SlidingWindowRateLimiter, so read the
        // exact options instance the production factory configured the limiter with.
        var field = typeof(SlidingWindowRateLimiter)
            .GetField("_options", BindingFlags.NonPublic | BindingFlags.Instance);
        field.Should().NotBeNull();
        return (SlidingWindowRateLimiterOptions)field!.GetValue(BuildLimiter(partition))!;
    }

    [Fact]
    public void Register_policy_options_match_production_config()
    {
        var options = OptionsOf(RateLimitPolicies.Register(ContextWithIp(null)));

        options.PermitLimit.Should().Be(10);
        options.Window.Should().Be(TimeSpan.FromMinutes(10));
        options.SegmentsPerWindow.Should().Be(10);
        options.QueueLimit.Should().Be(0);
    }

    [Fact]
    public void Register_policy_limiter_behavior_matches_options()
    {
        var limiter = BuildLimiter(RateLimitPolicies.Register(ContextWithIp(null)));

        // Window / SegmentsPerWindow = 10min / 10 = 1min replenishment period
        limiter.ReplenishmentPeriod.Should().Be(TimeSpan.FromMinutes(1));

        // Fresh limiter starts with exactly PermitLimit permits available
        limiter.GetStatistics().CurrentAvailablePermits.Should().Be(10);

        // Requesting more than PermitLimit throws; the runtime message confirms the limit
        var act = () => limiter.AttemptAcquire(11);
        act.Should().Throw<ArgumentOutOfRangeException>()
            .WithMessage("*permit limit of 10*");

        // Exactly PermitLimit permits can be acquired at once
        using (var full = limiter.AttemptAcquire(10))
        {
            full.IsAcquired.Should().BeTrue();
        }
    }

    [Fact]
    public void Register_policy_partition_key_is_per_ip()
    {
        var partitionA = RateLimitPolicies.Register(ContextWithIp("203.0.113.10"));
        var partitionB = RateLimitPolicies.Register(ContextWithIp("203.0.113.11"));

        partitionA.PartitionKey.Should().Be("203.0.113.10");
        partitionB.PartitionKey.Should().Be("203.0.113.11");
        partitionA.PartitionKey.Should().NotBe(partitionB.PartitionKey);
    }

    [Fact]
    public void Register_policy_null_ip_maps_to_unknown_partition()
    {
        var partition = RateLimitPolicies.Register(ContextWithIp(null));

        partition.PartitionKey.Should().Be("unknown");
    }
}
