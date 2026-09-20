using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.ChannelExchangeRates;
using Domain.Entities.OrderPayments;
using Domain.Entities.Orders;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// multipayments (plan 2026-09-18, T11) — backend persistence-mirror E2E coverage for the
/// two entities added by migration 20260918131144_Add-MultiPayments-Module-And-Payment-Mirror.
/// NEW file, purely additive: NO existing E2E, support file, or production source is modified.
///
/// "Mirror + defaults" means a real row round-trips through the real PostgreSQL smca_test
/// preserving (a) the exact decimal column types, (b) the nullable rate-provenance fields,
/// (c) the enum values, and (d) the append-only semantics of the per-store rate register.
///
///   MPM1  Schema mirror: information_schema.columns reports OrderPayment.Amount numeric(18,2),
///         OrderPayment.RateApplied numeric(18,6), OrderPayment.AmountInOrderCurrency
///         numeric(18,2) and ChannelExchangeRate.Value numeric(18,6); the EF model exposes the
///         same configured column types.
///   MPM2  OrderPayment round-trip: one row with the synthetic USD pivot provenance (RateMethod /
///         RateCurrency / RateEffectiveFrom all NULL) and one with a frozen channel rate (all
///         three set) persist and read back exactly — enums, both amount columns to the cent and
///         RateApplied to 6 decimals.
///   MPM3  ChannelExchangeRate round-trip + append-only: two rows for the SAME (Method, Currency)
///         channel with different Value/EffectiveFrom coexist (no overwrite, no delete) and Value
///         keeps 6 decimals.
/// </summary>
[Collection("e2e")]
public sealed class MultiPaymentsPersistenceMirrorTests
{
    private readonly AppTestFactory _f;
    public MultiPaymentsPersistenceMirrorTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record SeededOwner(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId);

    /// <summary>
    /// LOCAL seed helper — does NOT modify the shared StoreSeed/AuthzSeed classes
    /// (E2E-untouchable rule). Same shape as OrderPaymentMethodPricingTests.SeedOwnerAsync:
    /// active OwnerAdmin user owning one active store, free Management module, Stores feature
    /// grant and SelectedStoreId set.
    /// </summary>
    private async Task<SeededOwner> SeedOwnerAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"mpm-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E MPM Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E MPM Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"MPM-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate: null,
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

    private async Task<Order> SeedOrderAsync(Guid storeId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var order = Order.Create(
            storeId,
            OrderType.Normal,
            description: "e2e-mpm",
            total: 0m,
            itemsCount: 0,
            date: DateTime.UtcNow,
            tenantId);
        db.Set<Order>().Add(order);
        await db.SaveChangesAsync();
        return order;
    }

    /// <summary>
    /// Deletes the MultiPayments rows seeded for the store BEFORE the shared store-graph cleanup.
    /// OrderPayment references Order and ChannelExchangeRate references Store, both with a
    /// Restrict FK; the shared cleanup does not know about either child table.
    /// </summary>
    private async Task CleanupMultiPaymentsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var orderIds = await db.Set<Order>().IgnoreQueryFilters()
            .Where(o => o.StoreId == storeId)
            .Select(o => o.Id)
            .ToListAsync();
        if (orderIds.Count > 0)
        {
            await db.Set<OrderPayment>().IgnoreQueryFilters()
                .Where(p => orderIds.Contains(p.OrderId))
                .ExecuteDeleteAsync();
        }

        await db.Set<ChannelExchangeRate>().IgnoreQueryFilters()
            .Where(r => r.StoreId == storeId)
            .ExecuteDeleteAsync();

        await db.Set<Order>().IgnoreQueryFilters()
            .Where(o => o.StoreId == storeId)
            .ExecuteDeleteAsync();
    }

    /// <summary>
    /// Reads the physical column type as <c>data_type:numeric_precision,numeric_scale</c>
    /// (e.g. "numeric:18,2") straight from PostgreSQL's information_schema — the strongest
    /// proof that the migration created the column with the mirror spec, not just the EF model.
    /// </summary>
    private static async Task<string> ReadPhysicalColumnTypeAsync(ApplicationDbContext db, string table, string column)
    {
        var sql = "SELECT (data_type || ':' || numeric_precision || ',' || numeric_scale) AS \"Value\" " +
                  "FROM information_schema.columns " +
                  $"WHERE table_schema = 'public' AND table_name = '{table}' AND column_name = '{column}'";
        return await db.Database.SqlQueryRaw<string>(sql).SingleAsync();
    }

    [Fact]
    public async Task MPM1_schema_columns_match_the_mirror_spec()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Physical PostgreSQL columns (information_schema).
        (await ReadPhysicalColumnTypeAsync(db, "OrderPayment", "Amount"))
            .Should().Be("numeric:18,2", "OrderPayment.Amount is a 2-decimal money column");
        (await ReadPhysicalColumnTypeAsync(db, "OrderPayment", "RateApplied"))
            .Should().Be("numeric:18,6", "the frozen rate keeps 6 decimals");
        (await ReadPhysicalColumnTypeAsync(db, "OrderPayment", "AmountInOrderCurrency"))
            .Should().Be("numeric:18,2", "the order-currency conversion is a 2-decimal money column");
        (await ReadPhysicalColumnTypeAsync(db, "ChannelExchangeRate", "Value"))
            .Should().Be("numeric:18,6", "the per-USD rate keeps 6 decimals");

        // The EF model resolves the same store types (Npgsql maps the configured
        // "decimal(18,x)" to the PostgreSQL store type "numeric(18,x)").
        var orderPayment = db.Model.FindEntityType(typeof(OrderPayment))!;
        orderPayment.FindProperty(nameof(OrderPayment.Amount))!.GetColumnType().Should().Be("numeric(18,2)");
        orderPayment.FindProperty(nameof(OrderPayment.RateApplied))!.GetColumnType().Should().Be("numeric(18,6)");
        orderPayment.FindProperty(nameof(OrderPayment.AmountInOrderCurrency))!.GetColumnType().Should().Be("numeric(18,2)");

        var channelRate = db.Model.FindEntityType(typeof(ChannelExchangeRate))!;
        channelRate.FindProperty(nameof(ChannelExchangeRate.Value))!.GetColumnType().Should().Be("numeric(18,6)");
    }

    [Fact]
    public async Task MPM2_order_payment_round_trips_both_rate_provenances()
    {
        var seeded = await SeedOwnerAsync();
        try
        {
            var order = await SeedOrderAsync(seeded.StoreId, seeded.TenantId);

            // Row A — synthetic USD pivot: RateMethod/RateCurrency/RateEffectiveFrom all NULL.
            var pivot = OrderPayment.Create(
                order.Id,
                method: SalePaymentMethod.Zelle,
                currency: Currency.USD,
                amount: 50.00m,
                rateApplied: 1.250000m,
                rateMethod: null,
                rateCurrency: null,
                rateEffectiveFrom: null,
                amountInOrderCurrency: 62.50m,
                seeded.TenantId);

            // Row B — frozen channel rate: all three provenance fields set.
            var frozenEffectiveFrom = new DateTime(2026, 9, 18, 12, 0, 0, DateTimeKind.Utc);
            var frozen = OrderPayment.Create(
                order.Id,
                method: SalePaymentMethod.Transferencia,
                currency: Currency.MLC,
                amount: 120.55m,
                rateApplied: 300.123456m,
                rateMethod: SalePaymentMethod.Zelle,
                rateCurrency: Currency.USD,
                rateEffectiveFrom: frozenEffectiveFrom,
                amountInOrderCurrency: 36180.05m,
                seeded.TenantId);

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<OrderPayment>().Add(pivot);
                db.Set<OrderPayment>().Add(frozen);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var rows = await db.Set<OrderPayment>().IgnoreQueryFilters().AsNoTracking()
                    .Where(p => p.OrderId == order.Id)
                    .OrderBy(p => p.Amount)
                    .ToListAsync();
                rows.Should().HaveCount(2);

                var readPivot = rows.Single(p => p.Id == pivot.Id);
                readPivot.Method.Should().Be(SalePaymentMethod.Zelle);
                readPivot.Currency.Should().Be(Currency.USD);
                readPivot.Amount.Should().Be(50.00m);
                readPivot.RateApplied.Should().Be(1.250000m, "the rate round-trips to 6 decimals");
                readPivot.RateMethod.Should().BeNull("the USD pivot has no channel provenance");
                readPivot.RateCurrency.Should().BeNull("the USD pivot has no channel provenance");
                readPivot.RateEffectiveFrom.Should().BeNull("the USD pivot has no effective date");
                readPivot.AmountInOrderCurrency.Should().Be(62.50m);
                readPivot.TenantId.Should().Be(seeded.TenantId);

                var readFrozen = rows.Single(p => p.Id == frozen.Id);
                readFrozen.Method.Should().Be(SalePaymentMethod.Transferencia);
                readFrozen.Currency.Should().Be(Currency.MLC);
                readFrozen.Amount.Should().Be(120.55m);
                readFrozen.RateApplied.Should().Be(300.123456m, "the frozen rate round-trips to 6 decimals");
                readFrozen.RateMethod.Should().Be(SalePaymentMethod.Zelle);
                readFrozen.RateCurrency.Should().Be(Currency.USD);
                readFrozen.RateEffectiveFrom.Should().Be(frozenEffectiveFrom);
                readFrozen.AmountInOrderCurrency.Should().Be(36180.05m);
                readFrozen.TenantId.Should().Be(seeded.TenantId);
            }
        }
        finally
        {
            await CleanupMultiPaymentsAsync(seeded.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task MPM3_channel_exchange_rate_two_rows_for_same_channel_coexist_append_only()
    {
        var seeded = await SeedOwnerAsync();
        try
        {
            var firstEffectiveFrom = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
            var secondEffectiveFrom = new DateTime(2026, 9, 18, 0, 0, 0, DateTimeKind.Utc);

            var first = ChannelExchangeRate.Create(
                seeded.StoreId,
                method: SalePaymentMethod.Transferencia,
                currency: Currency.MLC,
                value: 250.000000m,
                effectiveFrom: firstEffectiveFrom,
                seeded.TenantId);

            var second = ChannelExchangeRate.Create(
                seeded.StoreId,
                method: SalePaymentMethod.Transferencia,
                currency: Currency.MLC,
                value: 300.123456m,
                effectiveFrom: secondEffectiveFrom,
                seeded.TenantId);

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<ChannelExchangeRate>().Add(first);
                db.Set<ChannelExchangeRate>().Add(second);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var rows = await db.Set<ChannelExchangeRate>().IgnoreQueryFilters().AsNoTracking()
                    .Where(r => r.StoreId == seeded.StoreId
                                && r.Method == SalePaymentMethod.Transferencia
                                && r.Currency == Currency.MLC)
                    .OrderBy(r => r.EffectiveFrom)
                    .ToListAsync();

                // Append-only register: a second rate for the same channel coexists with the first.
                rows.Should().HaveCount(2, "the register is append-only — a new rate never overwrites a previous one");
                rows.Select(r => r.Id).Should().BeEquivalentTo(new[] { first.Id, second.Id });

                var readFirst = rows[0];
                readFirst.Value.Should().Be(250.000000m, "Value round-trips to 6 decimals");
                readFirst.EffectiveFrom.Should().Be(firstEffectiveFrom);
                readFirst.TenantId.Should().Be(seeded.TenantId);

                var readSecond = rows[1];
                readSecond.Value.Should().Be(300.123456m, "Value round-trips to 6 decimals");
                readSecond.EffectiveFrom.Should().Be(secondEffectiveFrom);
                readSecond.TenantId.Should().Be(seeded.TenantId);
            }
        }
        finally
        {
            await CleanupMultiPaymentsAsync(seeded.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }
}
