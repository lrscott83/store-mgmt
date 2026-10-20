using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;

namespace Domain.UnitTests.Entities
{
    /// <summary>
    /// Máquina de estados del pedido online. Secuencia estricta, sin saltos:
    ///
    ///   Delivery: Creado -> Preparado -> Transportando -> Entregado
    ///   Pickup:   Creado -> Preparado -> Entregado
    ///   (ambos)  : cualquier estado no terminal -> Cancelado
    ///
    /// `Entregado` y `Cancelado` son terminales. Además de la tabla, la puerta hace cumplir tres
    /// reglas que estos tests fijan: cancelar exige razón, pasar a reparto exige repartidor, y
    /// entregar deja el pedido pagado.
    /// </summary>
    public class OrderStatusTransitionTests
    {
        private const string Reason = "El cliente no contesta";

        /// <summary>
        /// Tabla completa por tipo de entrega. `Transportando` sólo aparece con `Delivery`: en
        /// recogida, `Preparado` pasa directo a `Entregado`.
        /// </summary>
        private static readonly (OrderDeliveryType DeliveryType, OrderStatus From, OrderStatus[] Allowed)[] TransitionTable =
        [
            (OrderDeliveryType.Delivery, OrderStatus.Creado, [OrderStatus.Preparado, OrderStatus.Cancelado]),
            (OrderDeliveryType.Delivery, OrderStatus.Preparado, [OrderStatus.Transportando, OrderStatus.Cancelado]),
            (OrderDeliveryType.Delivery, OrderStatus.Transportando, [OrderStatus.Entregado, OrderStatus.Cancelado]),
            (OrderDeliveryType.Delivery, OrderStatus.Entregado, []),
            (OrderDeliveryType.Delivery, OrderStatus.Cancelado, []),

            (OrderDeliveryType.Pickup, OrderStatus.Creado, [OrderStatus.Preparado, OrderStatus.Cancelado]),
            (OrderDeliveryType.Pickup, OrderStatus.Preparado, [OrderStatus.Entregado, OrderStatus.Cancelado]),
            (OrderDeliveryType.Pickup, OrderStatus.Entregado, []),
            (OrderDeliveryType.Pickup, OrderStatus.Cancelado, []),
        ];

        private static readonly Guid DriverId = Guid.NewGuid();

        private static Order OrderInStatus(OrderStatus status, OrderDeliveryType deliveryType = OrderDeliveryType.Delivery)
        {
            Order order = CreateOnlineOrder(deliveryType);
            foreach (OrderStatus step in PathTo(status, deliveryType))
                MoveTo(order, step);

            return order;
        }

        /// <summary>
        /// Ruta LEGAL hasta el estado pedido. `Cancelado` se alcanza desde `Preparado` porque es el
        /// último estado común a los dos tipos de entrega, y los terminales no tienen salida.
        /// </summary>
        private static List<OrderStatus> PathTo(OrderStatus target, OrderDeliveryType deliveryType)
        {
            if (target == OrderStatus.Creado)
                return [];

            if (target == OrderStatus.Cancelado)
                return [OrderStatus.Preparado, OrderStatus.Cancelado];

            OrderStatus[] chain = deliveryType == OrderDeliveryType.Delivery
                ? [OrderStatus.Preparado, OrderStatus.Transportando, OrderStatus.Entregado]
                : [OrderStatus.Preparado, OrderStatus.Entregado];

            return [.. chain.TakeWhile(s => s != target).Append(target)];
        }

        /// <summary>
        /// Aplica un paso por la puerta real, aportando lo que cada transición exige. Usar
        /// `ChangeStatus` (y no asignar `Status`) es lo que hace que el arreglo no pueda inventarse
        /// un estado que la tabla no permite.
        /// </summary>
        private static void MoveTo(Order order, OrderStatus step)
        {
            if (step == OrderStatus.Cancelado)
                order.ChangeStatus(step, cancellationReason: Reason);
            else if (step == OrderStatus.Transportando)
                order.ChangeStatus(step, driverId: DriverId);
            else
                order.ChangeStatus(step);
        }

        private static Order CreateOnlineOrder(OrderDeliveryType deliveryType = OrderDeliveryType.Delivery) =>
            Order.CreateOnline(
                storeId: Guid.NewGuid(),
                tenantId: Guid.NewGuid(),
                code: "AB12CD",
                deliveryType: deliveryType,
                customerName: "Ana",
                customerPhone: "+5350000000",
                total: 100m,
                currency: Currency.CUP,
                lines: [new OrderLine(Guid.NewGuid(), "Azúcar", 1, 100m, Currency.CUP)],
                deliveryAddress: deliveryType == OrderDeliveryType.Delivery ? "Calle 1" : null);

        public static TheoryData<OrderDeliveryType, OrderStatus, OrderStatus> ValidTransitions()
        {
            var data = new TheoryData<OrderDeliveryType, OrderStatus, OrderStatus>();

            foreach ((OrderDeliveryType deliveryType, OrderStatus from, OrderStatus[] allowed) in TransitionTable)
                foreach (OrderStatus to in allowed)
                    data.Add(deliveryType, from, to);

            return data;
        }

        #region Happy path — toda transición de la tabla se ACEPTA

        [Theory]
        [MemberData(nameof(ValidTransitions))]
        public void ChangeStatus_FromAValidTransition_ShouldApplyTheNewStatus(
            OrderDeliveryType deliveryType, OrderStatus from, OrderStatus to)
        {
            // Arrange
            Order order = OrderInStatus(from, deliveryType);

            // Act
            MoveTo(order, to);

            // Assert
            order.Status.Should().Be(to);
        }

        /// <summary>
        /// Los dos recorridos completos. Que el camino entero funcione es la prueba de que la
        /// máquina no está cableada con casos sueltos.
        /// </summary>
        [Fact]
        public void ChangeStatus_ThroughTheWholeDeliveryPath_ShouldReachEntregado()
        {
            // Arrange
            Order order = CreateOnlineOrder(OrderDeliveryType.Delivery);

            // Act + Assert
            order.Status.Should().Be(OrderStatus.Creado);
            order.ChangeStatus(OrderStatus.Preparado);
            order.Status.Should().Be(OrderStatus.Preparado);
            order.ChangeStatus(OrderStatus.Transportando, driverId: DriverId);
            order.Status.Should().Be(OrderStatus.Transportando);
            order.ChangeStatus(OrderStatus.Entregado);
            order.Status.Should().Be(OrderStatus.Entregado);
        }

        [Fact]
        public void ChangeStatus_ThroughTheWholePickupPath_ShouldReachEntregadoWithoutTransportando()
        {
            // Arrange
            Order order = CreateOnlineOrder(OrderDeliveryType.Pickup);

            // Act + Assert
            order.Status.Should().Be(OrderStatus.Creado);
            order.ChangeStatus(OrderStatus.Preparado);
            order.Status.Should().Be(OrderStatus.Preparado);
            order.ChangeStatus(OrderStatus.Entregado);
            order.Status.Should().Be(OrderStatus.Entregado);
        }

        /// <summary>Un pedido se puede cancelar desde cualquier estado no terminal.</summary>
        [Theory]
        [InlineData(OrderDeliveryType.Delivery, OrderStatus.Creado)]
        [InlineData(OrderDeliveryType.Delivery, OrderStatus.Preparado)]
        [InlineData(OrderDeliveryType.Delivery, OrderStatus.Transportando)]
        [InlineData(OrderDeliveryType.Pickup, OrderStatus.Creado)]
        [InlineData(OrderDeliveryType.Pickup, OrderStatus.Preparado)]
        public void ChangeStatus_FromAnyNonTerminalState_ShouldAcceptCancelado(
            OrderDeliveryType deliveryType, OrderStatus from)
        {
            // Arrange
            Order order = OrderInStatus(from, deliveryType);

            // Act
            order.ChangeStatus(OrderStatus.Cancelado, cancellationReason: Reason);

            // Assert
            order.Status.Should().Be(OrderStatus.Cancelado);
        }

        #endregion

        #region Reglas propias de la puerta

        [Fact]
        public void ChangeStatus_ToCanceladoWithoutReason_ShouldThrowAndKeepTheStatus()
        {
            // Arrange
            Order order = OrderInStatus(OrderStatus.Preparado);

            // Act
            Action act = () => order.ChangeStatus(OrderStatus.Cancelado);

            // Assert
            act.Should().Throw<MissingCancellationReasonException>();
            order.Status.Should().Be(OrderStatus.Preparado);
            order.CancellationReason.Should().BeNull("un rechazo no debe dejar la razón escrita");
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        public void ChangeStatus_ToCanceladoWithABlankReason_ShouldThrow(string reason)
        {
            // Arrange
            Order order = OrderInStatus(OrderStatus.Preparado);

            // Act
            Action act = () => order.ChangeStatus(OrderStatus.Cancelado, cancellationReason: reason);

            // Assert
            act.Should().Throw<MissingCancellationReasonException>();
            order.Status.Should().Be(OrderStatus.Preparado);
        }

        [Fact]
        public void ChangeStatus_ToCancelado_ShouldStoreTheTrimmedReason()
        {
            // Arrange
            Order order = OrderInStatus(OrderStatus.Preparado);

            // Act
            order.ChangeStatus(OrderStatus.Cancelado, cancellationReason: "  El cliente desistió  ");

            // Assert
            order.CancellationReason.Should().Be("El cliente desistió");
        }

        [Fact]
        public void ChangeStatus_ToTransportandoWithoutDriver_ShouldThrowAndKeepTheStatus()
        {
            // Arrange
            Order order = OrderInStatus(OrderStatus.Preparado, OrderDeliveryType.Delivery);

            // Act
            Action act = () => order.ChangeStatus(OrderStatus.Transportando);

            // Assert
            act.Should().Throw<MissingDeliveryDriverException>();
            order.Status.Should().Be(OrderStatus.Preparado);
            order.DriverId.Should().BeNull();
        }

        [Fact]
        public void ChangeStatus_ToTransportando_ShouldAssignTheDriver()
        {
            // Arrange
            Order order = OrderInStatus(OrderStatus.Preparado, OrderDeliveryType.Delivery);

            // Act
            order.ChangeStatus(OrderStatus.Transportando, driverId: DriverId);

            // Assert
            order.DriverId.Should().Be(DriverId);
        }

        [Theory]
        [InlineData(OrderDeliveryType.Pickup, OrderStatus.Preparado)]
        [InlineData(OrderDeliveryType.Delivery, OrderStatus.Transportando)]
        public void ChangeStatus_ToEntregado_ShouldLeaveTheOrderPaid(
            OrderDeliveryType deliveryType, OrderStatus from)
        {
            // Arrange
            Order order = OrderInStatus(from, deliveryType);
            order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);

            // Act
            order.ChangeStatus(OrderStatus.Entregado);

            // Assert
            order.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
        }

        [Fact]
        public void ChangeStatus_WithAReasonOnANonCancellingTransition_ShouldThrow()
        {
            // Arrange
            Order order = OrderInStatus(OrderStatus.Creado);

            // Act
            Action act = () => order.ChangeStatus(OrderStatus.Preparado, cancellationReason: Reason);

            // Assert
            act.Should().Throw<UnexpectedStatusOptionException>();
            order.Status.Should().Be(OrderStatus.Creado);
        }

        [Fact]
        public void ChangeStatus_WithADriverOnANonTransportingTransition_ShouldThrow()
        {
            // Arrange
            Order order = OrderInStatus(OrderStatus.Creado);

            // Act
            Action act = () => order.ChangeStatus(OrderStatus.Preparado, driverId: DriverId);

            // Assert
            act.Should().Throw<UnexpectedStatusOptionException>();
            order.Status.Should().Be(OrderStatus.Creado);
        }

        #endregion

        #region Error handling — toda transición FUERA de la tabla se RECHAZA

        /// <summary>
        /// Todas las combinaciones (from, to) que la tabla no permite, para cada tipo de entrega.
        /// Es un barrido exhaustivo y no una lista de casos: si alguien añade un estado nuevo a
        /// <see cref="OrderStatus"/>, este test empieza a fallar y le obliga a decidir su fila.
        /// </summary>
        [Theory]
        [MemberData(nameof(InvalidTransitions))]
        public void ChangeStatus_FromAnInvalidTransition_ShouldThrowAndKeepTheStatus(
            OrderDeliveryType deliveryType, OrderStatus from, OrderStatus to)
        {
            // Arrange
            Order order = OrderInStatus(from, deliveryType);

            // Act
            Action act = () => order.ChangeStatus(
                to,
                driverId: to == OrderStatus.Transportando ? DriverId : null,
                cancellationReason: to == OrderStatus.Cancelado ? Reason : null);

            // Assert
            act.Should().Throw<InvalidOrderStatusTransitionException>()
                .WithMessage($"*{from}*{to}*");
            order.Status.Should().Be(from, "un rechazo NO debe mover el estado");
        }

        public static TheoryData<OrderDeliveryType, OrderStatus, OrderStatus> InvalidTransitions()
        {
            var data = new TheoryData<OrderDeliveryType, OrderStatus, OrderStatus>();

            foreach ((OrderDeliveryType deliveryType, OrderStatus from, OrderStatus[] allowed) in TransitionTable)
                foreach (OrderStatus to in Enum.GetValues<OrderStatus>())
                    if (to != from && !allowed.Contains(to))
                        data.Add(deliveryType, from, to);

            return data;
        }

        /// <summary>
        /// Entregado y Cancelado son terminales: ni siquiera a sí mismos. Este test existe para que
        /// "no hacer nada" no quede pareciendo una operación válida.
        /// </summary>
        [Theory]
        [InlineData(OrderStatus.Entregado)]
        [InlineData(OrderStatus.Cancelado)]
        public void ChangeStatus_FromATerminalState_ShouldRejectEveryTarget(OrderStatus terminal)
        {
            // Arrange
            Order order = OrderInStatus(terminal, OrderDeliveryType.Pickup);

            // Act + Assert
            foreach (OrderStatus target in Enum.GetValues<OrderStatus>())
            {
                Action act = () => order.ChangeStatus(
                    target,
                    driverId: target == OrderStatus.Transportando ? DriverId : null,
                    cancellationReason: target == OrderStatus.Cancelado ? Reason : null);

                act.Should().Throw<InvalidOrderStatusTransitionException>();
                order.Status.Should().Be(terminal);
            }
        }

        /// <summary>
        /// El enum es un contrato con la base: estos son los cinco estados y estos sus valores.
        /// Enumera los valores reales en vez de los conocidos, así que un estado nuevo sin decisión
        /// explícita rompe el test.
        /// </summary>
        [Fact]
        public void OrderStatus_ShouldHaveExactlyTheFiveStatesAndTheirValues()
        {
            Enum.GetNames<OrderStatus>().Should().BeEquivalentTo(
                ["Creado", "Preparado", "Transportando", "Entregado", "Cancelado"]);

            ((int)OrderStatus.Creado).Should().Be(0);
            ((int)OrderStatus.Preparado).Should().Be(1);
            ((int)OrderStatus.Transportando).Should().Be(2);
            ((int)OrderStatus.Entregado).Should().Be(3);
            ((int)OrderStatus.Cancelado).Should().Be(10);
        }

        #endregion

        #region Integrations — la excepción expone el par que se rechazó

        [Fact]
        public void ChangeStatus_WithAnInvalidTransition_ShouldExposeFromAndToOnTheException()
        {
            // Arrange
            Order order = CreateOnlineOrder(OrderDeliveryType.Pickup);

            // Act
            InvalidOrderStatusTransitionException? thrown = null;
            try
            {
                order.ChangeStatus(OrderStatus.Entregado);
            }
            catch (InvalidOrderStatusTransitionException ex)
            {
                thrown = ex;
            }

            // Assert
            thrown.Should().NotBeNull();
            thrown!.From.Should().Be(OrderStatus.Creado);
            thrown.To.Should().Be(OrderStatus.Entregado);
        }

        #endregion
    }
}
