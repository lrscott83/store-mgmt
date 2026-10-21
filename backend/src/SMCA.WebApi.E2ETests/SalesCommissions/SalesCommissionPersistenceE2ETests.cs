using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.ProductSalesCommissions;
using Domain.Entities.SalesManagers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.E2ETests.Orders;
using Xunit;

namespace SMCA.WebApi.E2ETests.SalesCommissions;

/// <summary>
/// T3 del feature Gestores de ventas: las tres tablas del módulo existen y sobreviven a un
/// write/read real contra PostgreSQL, incluidos sus FKs y el pago completo.
///
/// No es un test de la generación automática (T6): aquí se crean las filas con las fábricas de
/// dominio y se prueba que EF las mapea y que el pago queda persistido.
/// </summary>
[Collection("e2e")]
public sealed class SalesCommissionPersistenceE2ETests
{
    private readonly AppTestFactory _f;

    public SalesCommissionPersistenceE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Sales_manager_product_config_and_commission_round_trip_through_postgres()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid orderId = Guid.Empty;
        Guid orderItemId = Guid.Empty;
        Guid managerId = Guid.Empty;

        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ECOM1");
                OrderItem item = order.OrderItems.Single();
                orderId = order.Id;
                orderItemId = item.Id;

                SalesManager manager = SalesManager.Create(fixture.UserId, fixture.OwnerId, fixture.TenantId);
                managerId = manager.Id;

                ProductSalesCommission config = ProductSalesCommission.Create(
                    fixture.StoreId,
                    fixture.ProductId,
                    SalesCommissionType.Fixed,
                    5m,
                    Currency.CUP,
                    fixture.TenantId);

                OrderSalesCommission commission = OrderSalesCommission.Create(
                    order.Id,
                    item.Id,
                    manager.Id,
                    fixture.OwnerId,
                    fixture.StoreId,
                    SalesCommissionType.Fixed,
                    5m,
                    item.Price,
                    item.Quantity,
                    10m,
                    Currency.CUP,
                    fixture.TenantId);

                OrderSalesManager attribution = OrderSalesManager.Create(
                    order.Id,
                    manager.Id,
                    fixture.OwnerId,
                    fixture.StoreId,
                    fixture.TenantId);

                db.Set<SalesManager>().Add(manager);
                db.Set<ProductSalesCommission>().Add(config);
                db.Set<OrderSalesCommission>().Add(commission);
                db.Set<OrderSalesManager>().Add(attribution);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                SalesManager manager = await db.Set<SalesManager>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.Id == managerId);
                manager.UserId.Should().Be(fixture.UserId);
                manager.OwnerId.Should().Be(fixture.OwnerId);
                manager.TenantId.Should().Be(fixture.TenantId);

                ProductSalesCommission config = await db.Set<ProductSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.ProductId == fixture.ProductId);
                config.StoreId.Should().Be(fixture.StoreId);
                config.Type.Should().Be(SalesCommissionType.Fixed);
                config.Value.Should().Be(5m);
                config.Currency.Should().Be(Currency.CUP);

                OrderSalesManager attribution = await db.Set<OrderSalesManager>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.OrderId == orderId);
                attribution.SalesManagerId.Should().Be(managerId);
                attribution.OwnerId.Should().Be(fixture.OwnerId);
                attribution.StoreId.Should().Be(fixture.StoreId);

                OrderSalesCommission commission = await db.Set<OrderSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.OrderItemId == orderItemId);
                commission.OrderId.Should().Be(orderId);
                commission.SalesManagerId.Should().Be(managerId);
                commission.OwnerId.Should().Be(fixture.OwnerId);
                commission.StoreId.Should().Be(fixture.StoreId);
                commission.UnitPrice.Should().Be(100m);
                commission.Quantity.Should().Be(2);
                commission.Amount.Should().Be(10m);
                commission.Currency.Should().Be(Currency.CUP);
                commission.Status.Should().Be(SalesCommissionStatus.Pending);

                DateTimeOffset paidAt = DateTimeOffset.UtcNow;
                commission.MarkPaid(fixture.UserId, paidAt, "pago E2E");
                db.Set<OrderSalesCommission>().Update(commission);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                OrderSalesCommission paid = await db.Set<OrderSalesCommission>()
                    .IgnoreQueryFilters()
                    .SingleAsync(x => x.OrderItemId == orderItemId);

                paid.Status.Should().Be(SalesCommissionStatus.Paid);
                paid.PaidByUserId.Should().Be(fixture.UserId);
                paid.PaidAt.Should().NotBeNull();
                paid.PaymentNote.Should().Be("pago E2E");
            }
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<OrderSalesManager>().IgnoreQueryFilters()
                    .Where(x => x.OrderId == orderId).ExecuteDeleteAsync();
                await db.Set<OrderSalesCommission>().IgnoreQueryFilters()
                    .Where(x => x.OrderId == orderId).ExecuteDeleteAsync();
                await db.Set<ProductSalesCommission>().IgnoreQueryFilters()
                    .Where(x => x.ProductId == fixture.ProductId).ExecuteDeleteAsync();
                await db.Set<SalesManager>().IgnoreQueryFilters()
                    .Where(x => x.Id == managerId).ExecuteDeleteAsync();
            }

            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
