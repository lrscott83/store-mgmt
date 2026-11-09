using Domain.Common.Enums;
using FluentAssertions;

namespace Domain.UnitTests.Enums
{
    /// <summary>
    /// El TIPO de una orden dice QUÉ venta es, no por dónde entró.
    ///
    /// Hasta la llegada del precio mayorista al catálogo web, el pedido online se guardaba con
    /// <c>OrderType.WhatsApp = 101</c>, un valor que no era un tipo sino un CANAL. Eso se retiró: el
    /// canal vive en <c>Order.IsOfflineOrder</c> y el tipo real es
    /// <see cref="OrderType.Normal"/>/<see cref="OrderType.Mayorista"/>.
    ///
    /// Lo que se fija aquí son los VALORES PERSISTIDOS: son los que ya están escritos en la tabla
    /// `Order` y en el almacén del POS, así que renumerarlos convertiría cada venta histórica en una
    /// venta de otro tipo sin que nada fallara.
    /// </summary>
    public class OrderTypeEnumTests
    {
        [Theory]
        [InlineData(OrderType.Normal, 1)]
        [InlineData(OrderType.Mayorista, 2)]
        [InlineData(OrderType.Merma, 3)]
        [InlineData(OrderType.Otro, 100)]
        public void OrderType_ShouldKeepItsPersistedValues(OrderType type, int persisted)
            => ((int)type).Should().Be(persisted);

        /// <summary>
        /// El canal no tiene casilla en el enum: si volviera, una venta mayorista del catálogo
        /// volvería a guardarse como "WhatsApp" y perdería su tipo real.
        /// </summary>
        [Fact]
        public void OrderType_ShouldNotReserveASlotForTheChannel()
        {
            Enum.GetValues<OrderType>().Select(type => (int)type)
                .Should().BeEquivalentTo([1, 2, 3, 100]);

            Enum.GetNames<OrderType>().Should().NotContain("WhatsApp");

            // 101 es el valor RETIRADO: la migración lo convierte a Normal (1).
            Enum.IsDefined(typeof(OrderType), 101).Should().BeFalse();
        }
    }
}
