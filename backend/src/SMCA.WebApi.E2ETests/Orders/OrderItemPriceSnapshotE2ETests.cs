using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// R3-PERSISTENCE-ROUNDTRIP (review de T1): las columnas del snapshot de precio de `OrderItem`
/// existen y sobreviven a un write/read real contra PostgreSQL. Los unitarios prueban el valor en
/// memoria; este prueba el mapeo EF y la materialización desde la base.
/// </summary>
[Collection("e2e")]
public sealed class OrderItemPriceSnapshotE2ETests
{
    private readonly AppTestFactory _f;

    public OrderItemPriceSnapshotE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task OrderItem_price_snapshot_round_trips_through_postgres()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid orderId = Guid.Empty;
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                Order order = Order.CreateOnline(
                    fixture.StoreId,
                    fixture.TenantId,
                    "E2ESNAP",
                    OrderDeliveryType.Pickup,
                    customerName: "Cliente Snapshot",
                    customerPhone: fixture.Phone,
                    total: 165m,
                    currency: Currency.CUP,
                    [new OrderLine(fixture.ProductId, fixture.ProductName, 2, 82.5m, Currency.CUP, 100m, 1250, 500)],
                    description: null,
                    deliveryAddress: null,
                    notes: "snapshot E2E");

                db.Set<Order>().Add(order);
                await db.SaveChangesAsync();
                orderId = order.Id;
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                OrderItem item = await db.Set<OrderItem>()
                    .IgnoreQueryFilters()
                    .SingleAsync(i => i.OrderId == orderId);

                item.BasePrice.Should().Be(100m);
                item.PercentDiscountPrice.Should().Be(1250);
                item.DiscountPrice.Should().Be(500);
                item.Price.Should().Be(82.5m, "Price sigue siendo el precio final cobrado");
                item.Currency.Should().Be(Currency.CUP);
            }
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
