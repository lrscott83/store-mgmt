using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;

namespace Domain.UnitTests.Entities
{
    /// <summary>
    /// El snapshot mayorista de la LÍNEA.
    ///
    /// El resumen que la tienda recibe por WhatsApp dice "12 cajas" y no 144 unidades, así que el
    /// pedido tiene que congelar los paquetes y la unidad configurada además del precio. Se congelan
    /// en el pedido —y no se derivan de la config del producto al leer— porque la config cambia:
    /// un pedido viejo tiene que seguir contando lo que se le cobró.
    ///
    /// `Price` sigue siendo el precio POR UNIDAD y `Quantity` las UNIDADES, así que
    /// `Price × Quantity` es el total de la línea en los dos modos.
    /// </summary>
    public class OrderOnlineWholesaleSnapshotTests
    {
        private static Order CreateOnline(OrderLine line, OrderType orderType = OrderType.Mayorista)
            => Order.CreateOnline(
                storeId: Guid.NewGuid(),
                tenantId: Guid.NewGuid(),
                code: "AB12CD",
                deliveryType: OrderDeliveryType.Pickup,
                customerName: "Ana",
                customerPhone: "+5350000000",
                total: line.Price * line.Quantity,
                currency: line.Currency,
                lines: [line],
                orderType: orderType);

        [Fact]
        public void CreateOnline_ShouldCopyTheWholesaleFactsIntoTheOrderItem()
        {
            Order order = CreateOnline(new OrderLine(
                Guid.NewGuid(), "Cerveza", 144, 70m, Currency.CUP,
                WholesalePackSize: 12,
                WholesalePacks: 12,
                WholesaleTierMinPacks: 10,
                WholesaleTierUnitPrice: 70m,
                WholesaleUnitLabel: "caja"));

            var item = order.OrderItems.Single();
            item.WholesalePackSize.Should().Be(12);
            item.WholesalePacks.Should().Be(12);
            item.WholesaleTierMinPacks.Should().Be(10);
            item.WholesaleTierUnitPrice.Should().Be(70m);
            item.WholesaleUnitLabel.Should().Be("caja");
            item.Price.Should().Be(70m, "Price es el precio de UNA unidad del escalón");
            item.Quantity.Should().Be(144, "Quantity son las UNIDADES de la línea");
        }

        /// <summary>
        /// 12 paquetes de 12 unidades a 70 por unidad: 144 × 70 = 10 080. El importe de la línea sigue
        /// saliendo de `Price × Quantity` aunque el cobro se piense en paquetes.
        /// </summary>
        [Fact]
        public void CreateOnline_WhenWholesale_ShouldKeepPriceTimesQuantityAsTheLineTotal()
        {
            Order order = CreateOnline(new OrderLine(
                Guid.NewGuid(), "Cerveza", 144, 70m, Currency.CUP,
                WholesalePackSize: 12, WholesalePacks: 12,
                WholesaleTierMinPacks: 10, WholesaleTierUnitPrice: 70m,
                WholesaleUnitLabel: "caja"));

            var item = order.OrderItems.Single();
            (item.Price * item.Quantity).Should().Be(10_080m);
            order.Total.Should().Be(10_080m);
        }

        /// <summary>
        /// Una venta al detal no tiene hecho mayorista: los cinco campos quedan en sus defaults, que
        /// es lo que hace que una línea antigua o al detal se lea exactamente como antes.
        /// </summary>
        [Fact]
        public void CreateOnline_WhenUnit_ShouldLeaveTheWholesaleSnapshotAtItsDefaults()
        {
            Order order = CreateOnline(
                new OrderLine(Guid.NewGuid(), "Arroz", 2, 100m, Currency.CUP),
                orderType: OrderType.Normal);

            var item = order.OrderItems.Single();
            item.WholesalePackSize.Should().Be(0);
            item.WholesalePacks.Should().Be(0);
            item.WholesaleTierMinPacks.Should().BeNull();
            item.WholesaleTierUnitPrice.Should().BeNull();
            item.WholesaleUnitLabel.Should().BeNull();
            order.OrderType.Should().Be(OrderType.Normal);
        }

        /// <summary>
        /// La línea mayorista también puede viajar en un pedido que no es mayorista (p. ej. mientras
        /// el modo cambia): el snapshot es de la LÍNEA y no se deriva del tipo del pedido.
        /// </summary>
        [Fact]
        public void CreateOnline_ShouldCopyTheSnapshotEvenWhenTheOrderTypeIsNotWholesale()
        {
            Order order = CreateOnline(
                new OrderLine(
                    Guid.NewGuid(), "Cerveza", 12, 90m, Currency.CUP,
                    WholesalePackSize: 12, WholesalePacks: 1,
                    WholesaleTierMinPacks: 1, WholesaleTierUnitPrice: 90m,
                    WholesaleUnitLabel: "caja"),
                orderType: OrderType.Normal);

            OrderItemSnapshotShouldMatch(order, packSize: 12, packs: 1, tierMinPacks: 1, unitPrice: 90m);
        }

        private static void OrderItemSnapshotShouldMatch(
            Order order, int packSize, int packs, int tierMinPacks, decimal unitPrice)
        {
            var item = order.OrderItems.Single();
            item.WholesalePackSize.Should().Be(packSize);
            item.WholesalePacks.Should().Be(packs);
            item.WholesaleTierMinPacks.Should().Be(tierMinPacks);
            item.WholesaleTierUnitPrice.Should().Be(unitPrice);
            item.WholesaleUnitLabel.Should().Be("caja");
        }
    }
}
