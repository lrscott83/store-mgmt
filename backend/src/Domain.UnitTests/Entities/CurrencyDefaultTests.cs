using Domain.Common.Enums;
using Domain.Entities.InventoryEntries;
using Domain.Entities.InventoryEntryCosts;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using Domain.Entities.Products;
using FluentAssertions;

namespace Domain.UnitTests.Entities
{
    /// <summary>
    /// currency-in-costs-and-prices (plan 2026-09-16): el Create público de cada
    /// entidad que porta Currency NO recibe moneda — el dominio siembra
    /// Currency.CUP por defecto (ausente del campo = CUP).
    /// </summary>
    public class CurrencyDefaultTests
    {
        [Fact]
        public void Order_Create_Should_DefaultCurrencyToCup()
        {
            // Arrange
            var storeId = Guid.NewGuid();
            var tenantId = Guid.NewGuid();

            // Act
            var order = Order.Create(storeId, OrderType.Normal, "Venta de prueba", 12m, 1, DateTime.UtcNow, tenantId);

            // Assert
            order.Currency.Should().Be(Currency.CUP);
        }

        [Fact]
        public void OrderItem_Create_Should_DefaultCurrencyToCup()
        {
            // Arrange
            var orderId = Guid.NewGuid();
            var productId = Guid.NewGuid();
            var tenantId = Guid.NewGuid();

            // Act
            var item = OrderItem.Create(orderId, productId, "Azúcar", 2, 6m, 1, tenantId);

            // Assert
            item.Currency.Should().Be(Currency.CUP);
        }

        [Fact]
        public void Product_Create_Should_DefaultCurrencyToCup()
        {
            // Arrange
            var categoryId = Guid.NewGuid();
            var tenantId = Guid.NewGuid();

            // Act
            var product = Product.Create("Azúcar", categoryId, 6m, 1, true, true, "P001", tenantId);

            // Assert
            product.Currency.Should().Be(Currency.CUP);
        }

        [Fact]
        public void InventoryEntry_Create_Should_DefaultCurrencyToCup()
        {
            // Arrange
            var storeId = Guid.NewGuid();
            var productId = Guid.NewGuid();
            var tenantId = Guid.NewGuid();

            // Act
            var entry = InventoryEntry.Create(storeId, productId, 10, 10, 5m, DateTime.UtcNow, tenantId);

            // Assert
            entry.Currency.Should().Be(Currency.CUP);
        }

        [Fact]
        public void InventoryEntryCost_Create_Should_DefaultCurrencyToCup()
        {
            // Arrange
            var inventoryEntryId = Guid.NewGuid();
            var orderItemId = Guid.NewGuid();
            var tenantId = Guid.NewGuid();

            // Act
            var cost = InventoryEntryCost.Create(inventoryEntryId, 5m, 10, orderItemId, tenantId);

            // Assert
            cost.Currency.Should().Be(Currency.CUP);
        }
    }
}