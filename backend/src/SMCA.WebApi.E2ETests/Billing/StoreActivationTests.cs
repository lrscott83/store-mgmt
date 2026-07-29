using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class StoreActivationTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public StoreActivationTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    private static object UpdateBody(Guid id, string name, IEnumerable<int> moduleIds) => new
    {
        Id = id,
        Name = name,
        Address = "a",
        Description = "d",
        Approved = true,
        ModuleIds = moduleIds,
        IsActive = true
    };

    [Fact]
    public async Task Paid_module_on_null_start_sets_paymentStartDate_to_today()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // Seed a free store (PaymentStartDate = null, only free modules)
        var freeStore = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            // Act: update the store adding a paid module (Statistics id=6)
            var newName = $"Activated-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{freeStore.StoreId}",
                    UpdateBody(Guid.Empty, newName,
                        new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            // Assert: PaymentStartDate should now be set to today (2026-07-15)
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Domain.Entities.Stores.Store>()
                .IgnoreQueryFilters()
                .FirstAsync(s => s.Id == freeStore.StoreId);
            store.PaymentStartDate.Should().Be(new DateOnly(2026, 7, 15));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, freeStore);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Free_modules_only_leaves_paymentStartDate_null()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // Seed a free store (PaymentStartDate = null, only free modules)
        var freeStore = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            // Act: update the store with only free modules (Management id=7)
            var newName = $"StillFree-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{freeStore.StoreId}",
                    UpdateBody(Guid.Empty, newName,
                        new[] { BillingSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            // Assert: PaymentStartDate should remain null (no paid modules added)
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Domain.Entities.Stores.Store>()
                .IgnoreQueryFilters()
                .FirstAsync(s => s.Id == freeStore.StoreId);
            store.PaymentStartDate.Should().BeNull();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, freeStore);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Existing_paymentStartDate_unchanged_when_adding_modules()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // Seed a store with an existing PaymentStartDate already set
        var existingDate = new DateOnly(2026, 5, 1);
        var store = await BillingSeed.SeedPaidStoreAsync(_f, existingDate, paidModulePrice: 1000f);
        try
        {
            // Act: update the store with additional modules (including the existing paid one)
            var newName = $"Extended-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{store.StoreId}",
                    UpdateBody(Guid.Empty, newName,
                        new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            // Assert: PaymentStartDate should remain unchanged
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var stored = await db.Set<Domain.Entities.Stores.Store>()
                .IgnoreQueryFilters()
                .FirstAsync(s => s.Id == store.StoreId);
            stored.PaymentStartDate.Should().Be(existingDate);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
