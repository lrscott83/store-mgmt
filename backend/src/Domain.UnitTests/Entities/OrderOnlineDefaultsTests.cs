using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;

namespace Domain.UnitTests.Entities
{
    /// <summary>
    /// Defaults del pedido online y de las entidades que lo sostienen
    /// (pedidos-whatsapp-persistencia F2, T4/T2).
    ///
    /// Lo que se fija aquí es la CONTRACTA de arranque: un pedido nace `New` + `Pending` +
    /// `Pickup` y su código/teléfono/dirección son datos, no campos obligatorios en el constructor
    /// viejo del POS (D6/D14 — el POS no escribe en el backend, así que `Create(...)` sigue igual).
    /// </summary>
    public class OrderOnlineDefaultsTests
    {
        private static Order CreateOnline() => Order.CreateOnline(
            storeId: Guid.NewGuid(),
            tenantId: Guid.NewGuid(),
            code: "AB12CD",
            deliveryType: OrderDeliveryType.Pickup,
            customerName: "Ana",
            customerPhone: "+5350000000",
            total: 150m,
            currency: Currency.CUP,
            lines:
            [
                new OrderLine(Guid.NewGuid(), "Azúcar", 2, 50m, Currency.CUP),
                new OrderLine(Guid.NewGuid(), "Arroz", 1, 50m, Currency.CUP),
            ],
            description: "Sin azúcar",
            deliveryAddress: null,
            notes: "Tocar el timbre");

        #region Happy path

        [Fact]
        public void CreateOnline_ShouldStartNewPendingAndPickup()
        {
            Order order = CreateOnline();

            order.Status.Should().Be(OrderStatus.New);
            order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
            order.DeliveryType.Should().Be(OrderDeliveryType.Pickup);
        }

        [Fact]
        public void CreateOnline_ShouldBeAWhatsAppOrder()
        {
            Order.CreateOnline(
                Guid.NewGuid(), Guid.NewGuid(), "AB12CD", OrderDeliveryType.Pickup,
                "Ana", "+5350000000", 150m, Currency.CUP,
                [new OrderLine(Guid.NewGuid(), "Azúcar", 3, 50m, Currency.CUP)],
                null, null, null)
                .OrderType.Should().Be(OrderType.WhatsApp);
        }

        /// <summary>
        /// El snapshot del `OrderItem` se guarda EN SERVIDOR (D6): nombre, precio y moneda LEÍDOS
        /// del catálogo, nunca los que envía el cliente. Por eso el constructor recibe la línea ya
        /// resuelta, y el total que se persiste es el que el servidor calculó.
        /// </summary>
        [Fact]
        public void CreateOnline_ShouldSnapshotEveryLineWithItsOrderIndex()
        {
            Order order = CreateOnline();

            order.OrderItems.Should().HaveCount(2);
            order.OrderItems.Select(i => i.OrderIndex).Should().BeEquivalentTo([0, 1]);
            order.OrderItems.Select(i => i.Name).Should().BeEquivalentTo(["Azúcar", "Arroz"]);
            order.OrderItems.Should().OnlyContain(i => i.Currency == Currency.CUP);
            order.OrderItems.Should().OnlyContain(i => i.OrderId == order.Id);
        }

        /// <summary>`ItemsCount` es la suma de cantidades: es lo que se usa en los listados.</summary>
        [Fact]
        public void CreateOnline_ShouldSumTheQuantitiesIntoItemsCount()
        {
            CreateOnline().ItemsCount.Should().Be(3);
        }

        [Fact]
        public void CreateOnline_ShouldCarryTheCustomerAndDeliveryData()
        {
            Order order = CreateOnline();

            order.Code.Should().Be("AB12CD");
            order.CustomerName.Should().Be("Ana");
            order.CustomerPhone.Should().Be("+5350000000");
            order.Description.Should().Be("Sin azúcar");
            order.Notes.Should().Be("Tocar el timbre");
            order.DeliveryAddress.Should().BeNull("pickup no lleva dirección");
            order.DriverId.Should().BeNull("el repartidor se asigna después (F7)");
        }

        [Fact]
        public void CreateOnline_ShouldRaiseTheOrderCreatedDomainEvent()
        {
            Order order = CreateOnline();

            order.GetDomainEvents().Should().ContainSingle()
                .Which.Should().BeOfType<OrderCreatedDomainEvent>();
        }

        #endregion

        #region Lo que NO cambia (D6/D14)

        /// <summary>
        /// D14: el POS sigue escribiendo ventas en su almacén local con `Create(...)`. Esa vía NO se
        /// toca: los campos nuevos son opcionales y por eso la tabla `Order` del backend queda con
        /// pedidos online sin romper nada de lo que ya funcionaba.
        /// </summary>
        [Fact]
        public void Create_ThePosFactory_ShouldLeaveTheOnlineFieldsAtTheirDefaults()
        {
            Order order = Order.Create(
                Guid.NewGuid(), OrderType.Normal, "Venta de prueba", 12m, 1, DateTime.UtcNow, Guid.NewGuid());

            order.Code.Should().BeNull();
            order.DeliveryType.Should().Be(OrderDeliveryType.Pickup);
            order.Status.Should().Be(OrderStatus.New);
            order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
            order.CustomerName.Should().BeNull();
            order.CustomerPhone.Should().BeNull();
            order.DeliveryAddress.Should().BeNull();
            order.Notes.Should().BeNull();
            order.DriverId.Should().BeNull();
        }

        #endregion

        #region StoreCatalogSettings

        [Fact]
        public void StoreCatalogSettings_Create_ShouldBeClosedAndOnTheCurrentPalette()
        {
            Domain.Entities.StoreCatalogSettings.StoreCatalogSettings settings =
                Domain.Entities.StoreCatalogSettings.StoreCatalogSettings.Create(Guid.NewGuid(), Guid.NewGuid());

            // F1 tiene que habilitar los pedidos a propósito: publicar el catálogo NO publica los pedidos.
            settings.Enabled.Should().BeFalse();
            settings.PickupEnabled.Should().BeFalse();
            settings.DeliveryEnabled.Should().BeFalse();
            settings.DeliveryFee.Should().Be(0m);
            settings.MinimumOrderAmount.Should().Be(0m);
            settings.PaletteId.Should().Be("default");
            settings.WhatsappNumber.Should().BeNull();
            settings.LogoKey.Should().BeNull();
            settings.BannerKey.Should().BeNull();
        }

        /// <summary>A3 eliminada: la moneda del pedido sale del catálogo, no de un ajuste de tienda.</summary>
        [Fact]
        public void StoreCatalogSettings_ShouldNotCarryACurrency()
        {
            typeof(Domain.Entities.StoreCatalogSettings.StoreCatalogSettings)
                .GetProperties()
                .Select(p => p.Name)
                .Should().NotContain("Currency");
        }

        #endregion

        #region DeliveryDriver

        [Fact]
        public void DeliveryDriver_Create_ShouldBelongToTheStoreAndStartActive()
        {
            var storeId = Guid.NewGuid();
            var tenantId = Guid.NewGuid();

            Domain.Entities.DeliveryDrivers.DeliveryDriver driver =
                Domain.Entities.DeliveryDrivers.DeliveryDriver.Create(storeId, "Pedro", "+5351111111", tenantId);

            driver.StoreId.Should().Be(storeId);
            driver.TenantId.Should().Be(tenantId);
            driver.Name.Should().Be("Pedro");
            driver.Phone.Should().Be("+5351111111");
            driver.IsActive.Should().BeTrue("IsActive es la baja lógica del repartidor");
        }

        #endregion
    }
}