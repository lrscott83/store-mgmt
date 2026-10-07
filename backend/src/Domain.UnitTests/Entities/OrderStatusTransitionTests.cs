using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;

namespace Domain.UnitTests.Entities
{
    /// <summary>
    /// Tabla de transiciones de estado del pedido online (pedidos-whatsapp-persistencia F2, T8,
    /// decisiones D11/D18):
    ///
    ///   New       -> Accepted, Cancelled
    ///   Accepted  -> Preparing, Cancelled
    ///   Preparing -> Ready, Cancelled
    ///   Ready     -> Delivered, Cancelled
    ///   Delivered -> (terminal)
    ///   Cancelled -> (terminal)
    ///
    /// NO existe "En camino" (D18) y un estado terminal no se mueve. Estos tests fijan las DOS
    /// mitades de la tabla: lo que se acepta y lo que se rechaza, para que nadie pueda abrir un
    /// hueco por descuido (saltarse Preparing, resucitar un pedido cancelado, ...).
    /// </summary>
    public class OrderStatusTransitionTests
    {
        /// <summary>Tabla completa de la decisión D11, tal cual está escrita en el plan.</summary>
        private static readonly (OrderStatus From, OrderStatus[] Allowed)[] TransitionTable =
        [
            (OrderStatus.New, [OrderStatus.Accepted, OrderStatus.Cancelled]),
            (OrderStatus.Accepted, [OrderStatus.Preparing, OrderStatus.Cancelled]),
            (OrderStatus.Preparing, [OrderStatus.Ready, OrderStatus.Cancelled]),
            (OrderStatus.Ready, [OrderStatus.Delivered, OrderStatus.Cancelled]),
            (OrderStatus.Delivered, []),
            (OrderStatus.Cancelled, []),
        ];

        private static Order OrderInStatus(OrderStatus status)
        {
            Order order = CreateOnlineOrder();

            // Se llega al estado por la vía legal; si el estado inicial no es alcanzable desde
            // New, el test queArrange() falla aquí y el fallo señala la tabla, no elArrange().
            if (status != OrderStatus.New)
            {
                List<OrderStatus> path = PathTo(status);
                foreach (OrderStatus step in path)
                    order.ChangeStatus(step);
            }

            return order;
        }

        /// <summary>
        /// Ruta LEGAL hasta el estado pedido. `Cancelled` sale de `Accepted` y no se puede
        /// alcanzar desde `Delivered` (es terminal), así que su camino no es la cadena completa.
        /// </summary>
        private static List<OrderStatus> PathTo(OrderStatus target)
        {
            if (target == OrderStatus.Cancelled)
                return [OrderStatus.Accepted, OrderStatus.Cancelled];

            OrderStatus[] chain = [OrderStatus.Accepted, OrderStatus.Preparing, OrderStatus.Ready, OrderStatus.Delivered];
            return [.. chain.TakeWhile(s => s != target).Append(target)];
        }

        private static Order CreateOnlineOrder() =>
            Order.CreateOnline(
                storeId: Guid.NewGuid(),
                tenantId: Guid.NewGuid(),
                code: "AB12CD",
                deliveryType: OrderDeliveryType.Pickup,
                customerName: "Ana",
                customerPhone: "+5350000000",
                total: 100m,
                currency: Currency.CUP,
                lines: [new OrderLine(Guid.NewGuid(), "Azúcar", 1, 100m, Currency.CUP)],
                description: null,
                deliveryAddress: null,
                notes: null);

        #region Happy path — toda transición de la tabla se ACEPTA

        [Theory]
        [InlineData(OrderStatus.New, OrderStatus.Accepted)]
        [InlineData(OrderStatus.New, OrderStatus.Cancelled)]
        [InlineData(OrderStatus.Accepted, OrderStatus.Preparing)]
        [InlineData(OrderStatus.Accepted, OrderStatus.Cancelled)]
        [InlineData(OrderStatus.Preparing, OrderStatus.Ready)]
        [InlineData(OrderStatus.Preparing, OrderStatus.Cancelled)]
        [InlineData(OrderStatus.Ready, OrderStatus.Delivered)]
        [InlineData(OrderStatus.Ready, OrderStatus.Cancelled)]
        public void ChangeStatus_FromAValidTransition_ShouldApplyTheNewStatus(OrderStatus from, OrderStatus to)
        {
            // Arrange
            Order order = OrderInStatus(from);

            // Act
            order.ChangeStatus(to);

            // Assert
            order.Status.Should().Be(to);
        }

        /// <summary>
        /// La tabla se recorre entera desde New: el recorrido completo es la prueba de que la
        /// máquina NO está cableada con casos sueltos.
        /// </summary>
        [Fact]
        public void ChangeStatus_ThroughTheWholeHappyPath_ShouldReachDelivered()
        {
            // Arrange
            Order order = CreateOnlineOrder();

            // Act + Assert
            order.Status.Should().Be(OrderStatus.New);
            order.ChangeStatus(OrderStatus.Accepted);
            order.Status.Should().Be(OrderStatus.Accepted);
            order.ChangeStatus(OrderStatus.Preparing);
            order.Status.Should().Be(OrderStatus.Preparing);
            order.ChangeStatus(OrderStatus.Ready);
            order.Status.Should().Be(OrderStatus.Ready);
            order.ChangeStatus(OrderStatus.Delivered);
            order.Status.Should().Be(OrderStatus.Delivered);
        }

        /// <summary>Un pedido se puede cancelar desde cualquier estado no terminal (D11).</summary>
        [Theory]
        [InlineData(OrderStatus.New)]
        [InlineData(OrderStatus.Accepted)]
        [InlineData(OrderStatus.Preparing)]
        [InlineData(OrderStatus.Ready)]
        public void ChangeStatus_FromAnyNonTerminalState_ShouldAcceptCancelled(OrderStatus from)
        {
            // Arrange
            Order order = OrderInStatus(from);

            // Act
            order.ChangeStatus(OrderStatus.Cancelled);

            // Assert
            order.Status.Should().Be(OrderStatus.Cancelled);
        }

        #endregion

        #region Error handling — toda transición FUERA de la tabla se RECHAZA

        /// <summary>
        /// Todas las combinaciones (from, to) que la tabla no permite. Es un barrido exhaustivo y
        /// no una lista de casos: si alguien añade un estado nuevo a <see cref="OrderStatus"/>, este
        /// test empieza a fallar y le obliga a decidir su fila en la tabla a propósito.
        /// </summary>
        [Theory]
        [MemberData(nameof(InvalidTransitions))]
        public void ChangeStatus_FromAnInvalidTransition_ShouldThrowAndKeepTheStatus(OrderStatus from, OrderStatus to)
        {
            // Arrange
            Order order = OrderInStatus(from);

            // Act
            Action act = () => order.ChangeStatus(to);

            // Assert
            act.Should().Throw<InvalidOrderStatusTransitionException>()
                .WithMessage($"*{from}*{to}*");
            order.Status.Should().Be(from, "un rechazo NO debe mover el estado");
        }

        public static TheoryData<OrderStatus, OrderStatus> InvalidTransitions()
        {
            var data = new TheoryData<OrderStatus, OrderStatus>();

            foreach ((OrderStatus from, OrderStatus[] allowed) in TransitionTable)
                foreach (OrderStatus to in Enum.GetValues<OrderStatus>())
                    if (to != from && !allowed.Contains(to))
                        data.Add(from, to);

            return data;
        }

        /// <summary>
        /// Delivered y Cancelled son terminales: ni siquiera a sí mismos. Este test existe para
        /// que "no hacer nada" no quede pareciendo una operación válida.
        /// </summary>
        [Theory]
        [InlineData(OrderStatus.Delivered)]
        [InlineData(OrderStatus.Cancelled)]
        public void ChangeStatus_FromATerminalState_ShouldRejectEveryTarget(OrderStatus terminal)
        {
            // Arrange
            Order order = OrderInStatus(terminal);

            // Act + Assert
            foreach (OrderStatus target in Enum.GetValues<OrderStatus>())
            {
                Action act = () => order.ChangeStatus(target);
                act.Should().Throw<InvalidOrderStatusTransitionException>();
                order.Status.Should().Be(terminal);
            }
        }

        /// <summary>
        /// D18: "En camino" NO existe en la v1. Nadie puede colar un estado más sin que este test
        /// lo delate, porque enumera los valores reales en vez de los conocidos.
        /// </summary>
        [Fact]
        public void OrderStatus_ShouldNotHaveAnOnTheWayStatus()
        {
            Enum.GetNames<OrderStatus>().Should().BeEquivalentTo(
                ["New", "Accepted", "Preparing", "Ready", "Delivered", "Cancelled"]);
        }

        #endregion

        #region Integrations — la excepción expone el par que se rechazó

        [Fact]
        public void ChangeStatus_WithAnInvalidTransition_ShouldExposeFromAndToOnTheException()
        {
            // Arrange
            Order order = CreateOnlineOrder();

            // Act
            InvalidOrderStatusTransitionException? thrown = null;
            try
            {
                order.ChangeStatus(OrderStatus.Delivered);
            }
            catch (InvalidOrderStatusTransitionException ex)
            {
                thrown = ex;
            }

            // Assert
            thrown.Should().NotBeNull();
            thrown!.From.Should().Be(OrderStatus.New);
            thrown.To.Should().Be(OrderStatus.Delivered);
        }

        #endregion
    }
}