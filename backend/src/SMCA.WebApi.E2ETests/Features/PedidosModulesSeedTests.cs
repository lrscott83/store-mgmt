using Domain.Common.Enums;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

/// <summary>
/// Pins the 2026-10-08 module split (modulos-pedidos-whatsapp-gestion, decisions M1–M6) against
/// the HasData seed, reading the SEED TOPOLOGY straight out of the EF design-time model instead of
/// the database. This is the automated form of the manual SELECTs in
/// backend/scripts/31-20261008-Add-PedidosWhatsApp-GestionPedidos-Modules.sql: the script proves
/// the database agrees with the seed, these tests prove the seed itself is the agreed shape
/// (module 19 "Pedidos WhatsApp", module 20 "Gestión de pedidos", feature 123 moved to 20,
/// feature 124 on 19, and both modules only on Superior (3) + VIP (4)).
/// </summary>
[Collection("e2e")]
public sealed class PedidosModulesSeedTests
{
    private readonly AppTestFactory _f;
    public PedidosModulesSeedTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public void Modules_19_and_20_are_seeded_with_the_agreed_price()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var seedRows = db.GetService<IDesignTimeModel>().Model.GetEntityTypes()
            .Single(entityType => entityType.ClrType == typeof(Module))
            .GetSeedData();

        // Module 19 — "Pedidos WhatsApp" (M5: Price 10, 50 % discount → 5, not included).
        var whatsapp = seedRows.Single(row => Convert.ToInt32(row["Id"]) == 19);
        Assert.Equal("Pedidos WhatsApp", Convert.ToString(whatsapp["Name"]));
        Assert.Equal(150, Convert.ToInt32(whatsapp["Order"]));
        Assert.Equal(10, Convert.ToInt32(whatsapp["Price"]));
        Assert.Equal(0, Convert.ToInt32(whatsapp["DiscountPrice"]));
        Assert.Equal(50, Convert.ToInt32(whatsapp["PercentDiscountPrice"]));
        Assert.False(Convert.ToBoolean(whatsapp["PriceIncluded"]));
        Assert.True(Convert.ToBoolean(whatsapp["AvailableToStore"]));
        Assert.True(Convert.ToBoolean(whatsapp["IsActive"]));

        // Module 20 — "Gestión de pedidos" (same price shape, next order slot).
        var gestion = seedRows.Single(row => Convert.ToInt32(row["Id"]) == 20);
        Assert.Equal("Gestión de pedidos", Convert.ToString(gestion["Name"]));
        Assert.Equal(151, Convert.ToInt32(gestion["Order"]));
        Assert.Equal(10, Convert.ToInt32(gestion["Price"]));
        Assert.Equal(0, Convert.ToInt32(gestion["DiscountPrice"]));
        Assert.Equal(50, Convert.ToInt32(gestion["PercentDiscountPrice"]));
        Assert.False(Convert.ToBoolean(gestion["PriceIncluded"]));
        Assert.True(Convert.ToBoolean(gestion["AvailableToStore"]));
        Assert.True(Convert.ToBoolean(gestion["IsActive"]));
    }

    [Fact]
    public void Feature_123_moves_to_module_20_and_feature_124_lives_on_module_19()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var seedRows = db.GetService<IDesignTimeModel>().Model.GetEntityTypes()
            .Single(entityType => entityType.ClrType == typeof(Feature))
            .GetSeedData();

        // M3: "Pedidos online" persists the order and manages deliveries → Gestión de pedidos (20).
        var onlineOrders = seedRows.Single(row => Convert.ToInt32(row["Id"]) == (int)FeatureType.OnlineOrders);
        Assert.Equal("Pedidos online", Convert.ToString(onlineOrders["Name"]));
        Assert.Equal((int)ModuleType.GestionPedidos, Convert.ToInt32(onlineOrders["ModuleId"]));
        Assert.Equal(251, Convert.ToInt32(onlineOrders["Order"]));

        // M4: "Pedidos WhatsApp" is the cart plus its configuration → Pedidos WhatsApp (19).
        var pedidosWhatsApp = seedRows.Single(row => Convert.ToInt32(row["Id"]) == (int)FeatureType.PedidosWhatsApp);
        Assert.Equal("Pedidos WhatsApp", Convert.ToString(pedidosWhatsApp["Name"]));
        Assert.Equal((int)ModuleType.PedidosWhatsApp, Convert.ToInt32(pedidosWhatsApp["ModuleId"]));
        Assert.Equal(252, Convert.ToInt32(pedidosWhatsApp["Order"]));
    }

    [Fact]
    public void StorePlanModule_seeds_modules_19_and_20_on_superior_and_vip_only()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var seedRows = db.GetService<IDesignTimeModel>().Model.GetEntityTypes()
            .Single(entityType => entityType.ClrType == typeof(StorePlanModule))
            .GetSeedData();

        // M6: both new modules go to Superior (3) and VIP (4) — plans are self-contained — and
        // NEVER to Gratis (1) or Pago (2).
        var assignments = seedRows
            .Select(row => new
            {
                PlanId = Convert.ToInt32(row["PlanId"]),
                ModuleId = Convert.ToInt32(row["ModuleId"])
            })
            .Where(a => a.ModuleId == (int)ModuleType.PedidosWhatsApp
                        || a.ModuleId == (int)ModuleType.GestionPedidos)
            .OrderBy(a => a.PlanId)
            .ThenBy(a => a.ModuleId)
            .ToList();

        var superior = (int)StorePlanType.Superior;
        var vip = (int)StorePlanType.VIP;

        Assert.Equal(
            new[]
            {
                new { PlanId = superior, ModuleId = (int)ModuleType.PedidosWhatsApp },
                new { PlanId = superior, ModuleId = (int)ModuleType.GestionPedidos },
                new { PlanId = vip, ModuleId = (int)ModuleType.PedidosWhatsApp },
                new { PlanId = vip, ModuleId = (int)ModuleType.GestionPedidos }
            },
            assignments);
    }
}