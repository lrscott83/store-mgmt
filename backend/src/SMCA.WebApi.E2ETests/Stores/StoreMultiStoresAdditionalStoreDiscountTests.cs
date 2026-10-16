using System.Net;
using System.Net.Http.Json;
using Application.Dtos.StoreManagement;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// Owner decision 2026-10-16: MultiStores is charged once per owner. When a store is created
/// as an ADDITIONAL store (the owner already has at least one), its MultiStores (14) StoreModule
/// snapshots with the percent discount at 100, so that store pays 0 for the module. The first
/// store keeps the catalog discount. This is a service-level rule, so it holds for every creation
/// path (Owner, SuperAdmin, registration) by construction.
/// </summary>
[Collection("e2e")]
public sealed class StoreMultiStoresAdditionalStoreDiscountTests
{
    private const int MultiStoresModuleId = 14;
    private readonly AppTestFactory _f;
    public StoreMultiStoresAdditionalStoreDiscountTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid ownerId, string name) => new
    {
        OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null,
        Approved = false
    };

    [Fact]
    public async Task Additional_store_is_born_with_multi_stores_at_100_percent_discount()
    {
        var login = $"sa-msa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // The owner already has a store — the store about to be created is a second one.
        var existing = await StoreSeed.SeedStoreAsync(_f, $"MSA-EXIST-{Guid.NewGuid():N}", approved: true);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(existing.OwnerId, $"MSA-ADD-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreDto>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var catalog = await db.Set<Domain.Entities.Modules.Module>().IgnoreQueryFilters()
                .SingleAsync(m => m.Id == MultiStoresModuleId);

            var sm = await db.Set<StoreModule>().IgnoreQueryFilters()
                .SingleAsync(x => x.StoreId == created && x.ModuleId == MultiStoresModuleId);
            sm.ModulePercentDiscountPrice.Should().Be(100f,
                "an additional store pays 0 for MultiStores on that store");
            sm.ModulePrice.Should().Be(catalog.Price,
                "only the discount is overridden, never the catalog price snapshot");
            sm.IsActive.Should().BeTrue();
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupStoreFixtureAsync(_f, existing);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task First_store_keeps_the_catalog_multi_stores_discount()
    {
        var login = $"sa-msf-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // No store yet — this is the owner's FIRST store, so nothing is overridden.
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"MSF-FIRST-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreDto>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var catalog = await db.Set<Domain.Entities.Modules.Module>().IgnoreQueryFilters()
                .SingleAsync(m => m.Id == MultiStoresModuleId);

            var sm = await db.Set<StoreModule>().IgnoreQueryFilters()
                .SingleAsync(x => x.StoreId == created && x.ModuleId == MultiStoresModuleId);
            sm.ModulePercentDiscountPrice.Should().Be(catalog.PercentDiscountPrice,
                "a first store snapshots the catalog MultiStores discount unchanged");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
