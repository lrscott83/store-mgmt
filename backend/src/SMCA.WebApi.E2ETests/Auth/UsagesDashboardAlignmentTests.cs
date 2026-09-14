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
/// E2E for GET /api/v1/usages/stores-last-week (superadmin dashboard).
/// Contract (usage-dashboard-alignment): exactly 7 dense buckets, one per calendar
/// day from (UtcToday - 6) to UtcToday — days without usage (including an empty
/// today) get an explicit 0, so the frontend maps buckets 1:1 onto day labels
/// with no index shift. Regression for the "Monday shows Sunday's counts as
/// today" bug.
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
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var yesterday = DateTime.UtcNow.Date.AddDays(-1);
                db.Set<StoreUsage>().Add(StoreUsage.Create(store.StoreId, id, yesterday, "", "", "", ""));
                await db.SaveChangesAsync();
            }

            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync("/api/v1/usages/stores-last-week");
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
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().Add(StoreUsage.Create(store.StoreId, id, DateTime.UtcNow.Date, "", "", "", ""));
                await db.SaveChangesAsync();
            }

            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var r = await client.GetAsync("/api/v1/usages/stores-last-week");
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
