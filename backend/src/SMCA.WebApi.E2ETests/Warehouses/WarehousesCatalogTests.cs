using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.Modules;
using Domain.Entities.Features;
using Domain.Common.Utils;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Features;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Warehouses;

/// <summary>
/// WM-TE1 (spec warehouses-module-catalog): the Add-Warehouses-Module migration seeds the
/// Module 13 catalog row and Features 36/37 under it; the runtime `activate` endpoint stays
/// idempotent with 36 pre-seeded.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesCatalogTests
{
    private readonly AppTestFactory _f;
    public WarehousesCatalogTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Migration_seeds_module_13_with_paid_zero_effective_price()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // WMC-1a: exact catalog row shape
        var module = await db.Set<Module>().FindAsync((int)Domain.Common.Enums.ModuleType.Warehouses);
        module.Should().NotBeNull();
        module!.Name.Should().Be("Almacenes");
        module.IsActive.Should().BeTrue();
        module.PriceIncluded.Should().BeFalse();
        module.Price.Should().Be(2f);
        module.PercentDiscountPrice.Should().Be(100f);
        module.DiscountPrice.Should().Be(0f);
        module.AvailableToStore.Should().BeTrue();
        module.Order.Should().Be(110);
    }

    [Fact]
    public void Current_price_of_module_13_is_zero()
    {
        // WMC-1b: price 2 with 100% percent discount and no flat discount => effective 0
        CurrentPriceServiceUtils.GetCurrentPrice(2f, 100f, 0f).Should().Be(0f);
    }

    [Fact]
    public async Task Migration_seeds_features_36_37_under_module_13()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // WMC-2a: both features exist, active, available, under module 13
        var crud = await db.Set<Feature>().FindAsync((int)Domain.Common.Enums.FeatureType.Warehouses);
        crud.Should().NotBeNull();
        crud!.Name.Should().Be("Almacenes");
        crud.ModuleId.Should().Be((int)Domain.Common.Enums.ModuleType.Warehouses);
        crud.IsActive.Should().BeTrue();
        crud.AvailableToStore.Should().BeTrue();
        crud.Order.Should().Be(72);

        var movements = await db.Set<Feature>().FindAsync((int)Domain.Common.Enums.FeatureType.WarehouseStockMovements);
        movements.Should().NotBeNull();
        movements!.Name.Should().Be("Movimientos de almacén");
        movements.ModuleId.Should().Be((int)Domain.Common.Enums.ModuleType.Warehouses);
        movements.IsActive.Should().BeTrue();
        movements.AvailableToStore.Should().BeTrue();
        movements.Order.Should().Be(73);
    }

    [Fact]
    public async Task Activate_stays_idempotent_with_feature_36_pre_seeded()
    {
        // WMC-2b: the SuperAdmin activate endpoint must not duplicate the seeded row.
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsync("/api/v1/Features/activate", content: null);
            r.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Feature>().CountAsync(f => f.Id == 36)).Should().Be(1);
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
