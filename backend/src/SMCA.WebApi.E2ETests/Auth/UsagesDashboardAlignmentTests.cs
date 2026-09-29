using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.StoreUsages;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// E2E for GET /api/v1/usages/stores-last-week and /stores-last-month (superadmin
/// dashboard). Contract (usage-dashboard-alignment):
/// <list type="bullet">
/// <item>the window is anchored on the CLIENT's calendar day, sent as the REQUIRED
/// <c>today=yyyy-MM-dd</c> query parameter — never on the server clock. The dashboard
/// labels are built from the browser's local day, so anchoring on <c>UtcNow</c> slid
/// the chart one day for every user behind UTC from 19:00 local onward;</item>
/// <item>exactly N dense buckets, one per calendar day from (today - (N-1)) to today,
/// with an explicit 0 for a day without usage, so buckets map 1:1 onto labels with
/// no index shift.</item>
/// </list>
/// </summary>
[Collection("e2e")]
public sealed class UsagesDashboardAlignmentTests
{
    private readonly AppTestFactory _f;
    public UsagesDashboardAlignmentTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Stores_last_week_returns_dense_7_buckets_today_zero_when_nobody_connected()
    {
        // Arrange: usage rows for YESTERDAY only (the Monday-morning case).
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        try
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var yesterdayUtc = UtcDay(today.AddDays(-1));

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().Add(StoreUsage.Create(store.StoreId, id, yesterdayUtc, "", "", "", ""));
                await db.SaveChangesAsync();
            }

            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync($"/api/v1/usages/stores-last-week?today={Format(today)}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<StoreUsagesResponse>();
            body.Should().NotBeNull();
            body!.Data.StoreUsagesCountDays.Should().HaveCount(7, "dense buckets: exactly one per day");
            body.Data.OwnerNamesPerDay.Should().HaveCount(7);

            // Yesterday = index 5 (1 usage); today = index 6 (explicit 0, NOT yesterday's count).
            body.Data.StoreUsagesCountDays[5].Should().Be(1);
            body.Data.StoreUsagesCountDays[6].Should().Be(0,
                "an empty today must NOT receive yesterday's count (index-shift regression)");
            body.Data.OwnerNamesPerDay[5].Should().Contain("E2E Owner");
            body.Data.OwnerNamesPerDay[6].Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, id);
        }
    }

    [Fact]
    public async Task Stores_last_week_counts_today_usage_in_last_bucket()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        try
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var todayUtc = UtcDay(today);

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().Add(StoreUsage.Create(store.StoreId, id, todayUtc, "", "", "", ""));
                await db.SaveChangesAsync();
            }

            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync($"/api/v1/usages/stores-last-week?today={Format(today)}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<StoreUsagesResponse>();
            body!.Data.StoreUsagesCountDays.Should().HaveCount(7);
            body.Data.StoreUsagesCountDays[6].Should().Be(1, "today's usage lands in the last bucket");
            body.Data.StoreUsagesCountDays.Take(6).Should().OnlyContain(c => c == 0);
        }
        finally
        {
            await CleanupAsync(store, id);
        }
    }

    // ── today is REQUIRED and strictly yyyy-MM-dd ───────────────────────

    [Theory]
    [InlineData("stores-last-week")]
    [InlineData("stores-last-month")]
    public async Task Stores_endpoints_reject_a_missing_today_with_400(string endpoint)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync($"/api/v1/usages/{endpoint}");

            r.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "the client must declare its own calendar day; the server cannot guess it");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Today",
                "the failure must use the same ApiResponse envelope as every other validation error");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Theory]
    [InlineData("stores-last-week", "not-a-date")]
    [InlineData("stores-last-week", "")]
    [InlineData("stores-last-week", "2026-13-45")]
    // 30/09/2026 is a real calendar day but NOT the ISO shape the tracker emits.
    [InlineData("stores-last-week", "30/09/2026")]
    [InlineData("stores-last-week", "09-30-2026")]
    [InlineData("stores-last-week", "2026-9-30")]
    [InlineData("stores-last-month", "not-a-date")]
    [InlineData("stores-last-month", "30/09/2026")]
    public async Task Stores_endpoints_reject_a_malformed_today_with_400(string endpoint, string today)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync($"/api/v1/usages/{endpoint}?today={Uri.EscapeDataString(today)}");

            r.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                $"'{today}' is not the yyyy-MM-dd calendar day the tracker emits");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Today");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    // ── the window really follows `today` ────────────────────────────────

    /// <summary>
    /// The user's night-time symptom. A client in UTC-5 at 21:00 local is already on
    /// the NEXT UTC day; it sends that next day as <c>today</c>. The server must
    /// anchor there, so the usage the client recorded on its own day is the newest
    /// bucket. Anchoring on <c>UtcNow</c> instead pushes that usage one bucket to the
    /// left and leaves a phantom "today" bucket that has not happened for that user.
    /// </summary>
    [Fact]
    public async Task Stores_last_week_window_follows_today_when_it_differs_from_the_server_clock()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        try
        {
            // The client's day: the day AFTER the server's, as a UTC-5 user sees it
            // late in the evening.
            var serverToday = DateOnly.FromDateTime(DateTime.UtcNow);
            var clientToday = serverToday.AddDays(1);
            var clientTodayUtc = UtcDay(clientToday);

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                // The client stamped this on its own local day.
                db.Set<StoreUsage>().Add(StoreUsage.Create(store.StoreId, id, clientTodayUtc, "", "", "", ""));
                await db.SaveChangesAsync();
            }

            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync($"/api/v1/usages/stores-last-week?today={Format(clientToday)}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<StoreUsagesResponse>();
            body!.Data.StoreUsagesCountDays.Should().HaveCount(7);
            body.Data.StoreUsagesCountDays[6].Should().Be(1,
                "the client day is the last bucket — a UtcNow anchor would leave index 6 empty");
            body.Data.StoreUsagesCountDays.Take(6).Should().OnlyContain(c => c == 0,
                "nothing precedes the client day in this window");

            // The same day sent to the 30-day window lands in the same relative slot.
            var rMonth = await client.GetAsync($"/api/v1/usages/stores-last-month?today={Format(clientToday)}");
            rMonth.StatusCode.Should().Be(HttpStatusCode.OK);
            var monthBody = await rMonth.Content.ReadFromJsonAsync<StoreUsagesResponse>();
            monthBody!.Data.StoreUsagesCountDays.Should().HaveCount(30);
            monthBody.Data.StoreUsagesCountDays[29].Should().Be(1);
        }
        finally
        {
            await CleanupAsync(store, id);
        }
    }

    /// <summary>
    /// A <c>today</c> one day BEHIND the server's must not swallow the newer bucket:
    /// a usage stamped today (server day) falls outside that window entirely.
    /// </summary>
    [Fact]
    public async Task Stores_last_week_window_follows_a_past_today()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        try
        {
            var serverToday = DateOnly.FromDateTime(DateTime.UtcNow);
            var pastToday = serverToday.AddDays(-2);
            var twoDaysAgoUtc = UtcDay(pastToday.AddDays(-2));

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().Add(StoreUsage.Create(store.StoreId, id, twoDaysAgoUtc, "", "", "", ""));
                await db.SaveChangesAsync();
            }

            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync($"/api/v1/usages/stores-last-week?today={Format(pastToday)}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<StoreUsagesResponse>();
            body!.Data.StoreUsagesCountDays.Should().HaveCount(7);
            // Window = [pastToday-6 .. pastToday]; the row is 2 days before its end → index 4.
            body.Data.StoreUsagesCountDays[4].Should().Be(1);
            body.Data.StoreUsagesCountDays[6].Should().Be(0);
        }
        finally
        {
            await CleanupAsync(store, id);
        }
    }

    private static string Format(DateOnly today)
        => today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>
    /// A calendar day as the store it is stored in: midnight UTC, Kind=Utc. Npgsql
    /// refuses an Unspecified DateTime on a `timestamptz` column, so the Kind is
    /// explicit here — this is the same shape UpdateStoreDailyUsageCommand stamps.
    /// </summary>
    private static DateTime UtcDay(DateOnly day)
        => DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);

    private async Task CleanupAsync(StoreSeed.StoreFixture store, Guid userId)
    {
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<StoreUsage>().IgnoreQueryFilters()
                .Where(u => u.StoreId == store.StoreId).ExecuteDeleteAsync();
        }
        await StoreSeed.CleanupStoreFixtureAsync(_f, store);
        await DbTestHelpers.CleanupUserAsync(_f, userId);
    }

    private sealed record StoreUsagesResponse(bool Succeeded, StoreUsagesData Data);

    private sealed record StoreUsagesData(System.Collections.Generic.IList<int> StoreUsagesCountDays, int ActiveStoreCount,
        System.Collections.Generic.IList<System.Collections.Generic.IList<string>>? OwnerNamesPerDay);
}
