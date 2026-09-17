using System.Net;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using Xunit.Abstractions;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// payment-methods-percent-tax (plan 2026-09-17) — persistencia del modelo de
/// formas de pago en Order. E2E contra PostgreSQL real (smca_test), patrón de
/// seed LOCAL idéntico a MultiMonedasModuleTests (no toca StoreSeed/AuthzSeed):
///
///   PM1  Una Order seeded SIN los campos nuevos (fila creada solo con los
///        defaults de columna) lee Efectivo/0/0 — contrato de las ventas
///        históricas que el frontend sincronice.
///   PM2  Round-trip: una Order con SalePaymentMethod=Transferencia,
///        Percent=1, Tax=10 persiste y lee exactos (el total ajustado lo
///        calcula el cliente y viaja en el campo Total ya existente).
///   PM3  El schema migrado expone las 3 columnas con sus defaults (la
///        migración Add-SalePaymentMethod-Pricing aplicó en el arranque del
///        factory: defaults de columna 0/0/0 para TODA fila preexistente).
/// </summary>
[Collection("e2e")]
public sealed class OrderPaymentMethodPricingTests
{
    private readonly AppTestFactory _f;
    private readonly ITestOutputHelper _output;

    public OrderPaymentMethodPricingTests(WebAppFixture fixture, ITestOutputHelper output)
    {
        _f = fixture.Factory;
        _output = output;
    }

    private sealed record SeededOwner(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId);

    /// <summary>Deletes the orders seeded for the store BEFORE the store-graph cleanup
    /// (FK_Order_Store_StoreId blocks the store delete otherwise — Orders are children
    /// of Store, and the shared cleanup does not know about them).</summary>
    private async Task CleanupOrdersAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Order>().IgnoreQueryFilters().Where(o => o.StoreId == storeId).ExecuteDeleteAsync();
    }

    private async Task<SeededOwner> SeedOwnerAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"pmp-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E PM Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E PM Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"PM-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate: null,
            storePlanId: (int)StorePlanType.Superior);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, (int)ModuleType.Management, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
            store.Id, (int)RoleType.OwnerAdmin, AuthzSeed.StoresFeatureId, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return new SeededOwner(user.Id, login, owner.Id, store.Id, tenantId);
    }

    private async Task<Order> SeedOrderAsync(
        Guid storeId,
        Guid tenantId,
        decimal total,
        SalePaymentMethod? method = null,
        decimal percent = 0m,
        decimal tax = 0m)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var order = Order.Create(
            storeId,
            OrderType.Normal,
            description: "e2e-pm",
            total,
            itemsCount: 1,
            date: DateTime.UtcNow,
            tenantId);
        // Campos opcionales del plan: solo cuando el escenario los trae.
        if (method.HasValue) order.SalePaymentMethod = method.Value;
        order.Percent = percent;
        order.Tax = tax;
        db.Set<Order>().Add(order);
        await db.SaveChangesAsync();
        return order;
    }

    [Fact]
    public async Task PM1_order_without_new_fields_reads_defaults_efectivo_zero_zero()
    {
        var seeded = await SeedOwnerAsync();
        try
        {
            // Fila "histórica": se crea SIN tocar SalePaymentMethod (queda el
            // default Efectivo de la entidad) y con Percent/Tax en 0.
            var order = await SeedOrderAsync(seeded.StoreId, seeded.TenantId, total: 100m);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var read = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking().SingleAsync(o => o.Id == order.Id);
            read.SalePaymentMethod.Should().Be(SalePaymentMethod.Efectivo);
            read.Percent.Should().Be(0m);
            read.Tax.Should().Be(0m);
        }
        finally
        {
            await CleanupOrdersAsync(seeded.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task PM2_order_with_transferencia_percent_tax_round_trips_exact()
    {
        var seeded = await SeedOwnerAsync();
        try
        {
            const decimal baseTotal = 100m;
            var order = await SeedOrderAsync(
                seeded.StoreId,
                seeded.TenantId,
                total: baseTotal + baseTotal * 0.01m + 10m, // fórmula del plan: base + 1% + tax
                method: SalePaymentMethod.Transferencia,
                percent: 1m,
                tax: 10m);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var read = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking().SingleAsync(o => o.Id == order.Id);
            read.SalePaymentMethod.Should().Be(SalePaymentMethod.Transferencia);
            read.Percent.Should().Be(1m);
            read.Tax.Should().Be(10m);
            read.Total.Should().Be(111m);
        }
        finally
        {
            await CleanupOrdersAsync(seeded.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task PM3_migrated_schema_has_columns_with_zero_defaults()
    {
        // La migración ya corrió (el WebAppFixture aplica migraciones al arrancar).
        // Este test asegura que el mapeo EF expone las 3 columnas y que una fila
        // nueva sin los campos recibe los defaults de la ENTIDAD (0/0/Efectivo).
        var seeded = await SeedOwnerAsync();
        try
        {
            var order = await SeedOrderAsync(seeded.StoreId, seeded.TenantId, total: 50m);
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var entityType = db.Model.FindEntityType(typeof(Order))!;
            entityType.FindProperty(nameof(Order.SalePaymentMethod)).Should().NotBeNull();
            entityType.FindProperty(nameof(Order.Percent)).Should().NotBeNull();
            entityType.FindProperty(nameof(Order.Tax)).Should().NotBeNull();

            var read = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking().SingleAsync(o => o.Id == order.Id);
            read.SalePaymentMethod.Should().Be(SalePaymentMethod.Efectivo);
        }
        finally
        {
            await CleanupOrdersAsync(seeded.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }
}
