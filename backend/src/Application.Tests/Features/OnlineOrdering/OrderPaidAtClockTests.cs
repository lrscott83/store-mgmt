using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// La fecha de pago, DETERMINISTA (hallazgo R3 del review nativo): el dominio acepta un reloj, así
/// que aquí se afirma el instante EXACTO en vez de acotarlo con el reloj real. Los tests de handler
/// siguen usando el reloj del sistema —es lo que hace producción— y por eso allá la fecha se
/// comprueba por ventana; la regla en sí se fija aquí, sin depender de la hora de la máquina.
/// </summary>
public class OrderPaidAtClockTests
{
    private static readonly Guid StoreId = Guid.NewGuid();
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly DateTimeOffset Stamp = new(2026, 10, 26, 15, 5, 0, TimeSpan.Zero);

    /// <summary>Reloj fijo: `TimeProvider` es del framework, no hace falta un paquete de test.</summary>
    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static Order Online() => Order.CreateOnline(
        StoreId, TenantId, "PED-1", OrderDeliveryType.Pickup,
        "Marta", "555", 10m, Currency.CUP,
        [new OrderLine(Guid.NewGuid(), "Cafe", 1, 10m, Currency.CUP)],
        date: new DateTime(2026, 10, 26, 10, 0, 0, DateTimeKind.Utc));

    private static Order Pos() => Order.Create(
        StoreId, OrderType.Normal, "Venta POS", 10m, 1,
        new DateTime(2026, 10, 26, 10, 0, 0, DateTimeKind.Utc), TenantId);

    [Fact]
    public void MarkingPaid_StampsTheExactClockInstant()
    {
        Order order = Online();

        order.ChangePaymentStatus(OrderPaymentStatus.Paid, new FixedClock(Stamp));

        order.PaidAt.Should().Be(Stamp.UtcDateTime);
        order.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
    }

    [Fact]
    public void MarkingPaidTwice_KeepsTheFirstInstant()
    {
        Order order = Online();
        order.ChangePaymentStatus(OrderPaymentStatus.Paid, new FixedClock(Stamp));

        order.ChangePaymentStatus(OrderPaymentStatus.Paid, new FixedClock(Stamp.AddHours(3)));

        order.PaidAt.Should().Be(Stamp.UtcDateTime,
            "la constancia es la del primer cobro: un segundo clic no puede moverla");
    }

    [Fact]
    public void Delivering_StampsTheExactClockInstant()
    {
        Order order = Online();
        order.ChangeStatus(OrderStatus.Preparado);

        order.ChangeStatus(OrderStatus.Entregado, clock: new FixedClock(Stamp));

        order.PaidAt.Should().Be(Stamp.UtcDateTime);
    }

    [Fact]
    public void ReturningToPending_ClearsTheInstant()
    {
        Order order = Online();
        order.ChangePaymentStatus(OrderPaymentStatus.Paid, new FixedClock(Stamp));

        order.ChangePaymentStatus(OrderPaymentStatus.Pending, new FixedClock(Stamp.AddHours(3)));

        order.PaidAt.Should().BeNull("un pedido pendiente no puede conservar la fecha de un pago que ya no tiene");
    }

    [Fact]
    public void ANewOrder_HasNoPaidInstant()
    {
        Online().PaidAt.Should().BeNull();
        Pos().PaidAt.Should().BeNull();
    }
}
