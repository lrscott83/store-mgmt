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

[Collection("e2e")]
public sealed class UsagesSmokeTests
{
    private readonly AppTestFactory _f;
    public UsagesSmokeTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Usages_without_token_returns_401()
    {
        var r = await _f.CreateClient()
            .PostAsJsonAsync("/api/v1/usages/store-daily-usage", new { ActiveDays = new[] { new { Day = "2026-07-24", Saved = true } } });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Usages_super_admin_with_store_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"Usg-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var setStore = await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = store.StoreId });
            setStore.StatusCode.Should().Be(HttpStatusCode.OK);

            var r = await client
                .PostAsJsonAsync("/api/v1/usages/store-daily-usage", new { ActiveDays = new[] { new { Day = DateTime.UtcNow.ToString("yyyy-MM-dd"), Saved = true } } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            // Clean up StoreUsage rows created by the handler before deleting the store
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().RemoveRange(
                    await db.Set<StoreUsage>().IgnoreQueryFilters().Where(u => u.StoreId == store.StoreId).ToListAsync());
                await db.SaveChangesAsync();
            }
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }
}
