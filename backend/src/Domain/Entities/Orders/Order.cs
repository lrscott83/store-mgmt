using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Common.Events;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.OrderItems;
using Domain.Entities.OrderPayments;
using Domain.Entities.Stores;

namespace Domain.Entities.Orders
{
    public sealed class Order : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public ICollection<OrderItem> OrderItems { get; set; }
        /// <summary>Payments recorded for this order (MultiPayments mirror, 0..N).</summary>
        public ICollection<OrderPayment> Payments { get; set; }
        public OrderType OrderType { get; set; }
        public string Description { get; set; }
        public decimal Total { get; set; }
        /// <summary>Moneda de Total y de los precios de sus items (plan 2026-09-16). Default CUP.</summary>
        public Currency Currency { get; set; } = Currency.CUP;
        /// <summary>payment-methods-percent-tax (plan 2026-09-17): forma de pago de la venta. Default Efectivo (histórico sin método).</summary>
        public SalePaymentMethod SalePaymentMethod { get; set; } = SalePaymentMethod.Efectivo;
        /// <summary>Porcentaje aplicado al total al crear la venta (auditoría). Default 0 → total sin ajuste.</summary>
        public decimal Percent { get; set; }
        /// <summary>Monto fijo sumado al total al crear la venta (auditoría), en la moneda de la venta. Default 0.</summary>
        public decimal Tax { get; set; }
        public int ItemsCount { get; set; }
        public DateTime Date { get; set; }
        public Guid TenantId { get; set; }

        // --- Pedidos ONLINE (pedidos-whatsapp-persistencia, F2) ---------------------------------
        //
        // D6/D14: el POS NO lee ni escribe estos pedidos (sigue con su almacén local cifrado), así
        // que TODO lo de aquí es opcional y la tabla "Order" del backend contiene exclusivamente
        // pedidos online. Por eso los campos son nullables o traen un default neutro y
        // `Create(...)` (la vía del POS) queda intacta: una venta del POS no puede inventalo.

        /// <summary>
        /// Código público corto del pedido, ÚNICO POR TIENDA (índice parcial
        /// `("StoreId","Code")` con filtro `"Code" IS NOT NULL`). Es lo que la persona dicta por
        /// WhatsApp y lo que se consulta; null en las ventas del POS.
        /// </summary>
        public string? Code { get; set; }
        /// <summary>Recogida o envío a domicilio. Solo lo usa el pedido online.</summary>
        public OrderDeliveryType DeliveryType { get; set; } = OrderDeliveryType.Pickup;
        /// <summary>Estado del pedido online (D11). El POS nunca lo mueve.</summary>
        public OrderStatus Status { get; set; } = OrderStatus.Creado;
        /// <summary>Pago manual Pendiente/Paid (D3/D12), independiente de <see cref="Status"/>.</summary>
        public OrderPaymentStatus PaymentStatus { get; set; } = OrderPaymentStatus.Pending;
        /// <summary>
        /// Momento (UTC) en que el pedido quedó pagado, o null si sigue pendiente. Es la constancia
        /// del pago: la escribe SOLO <see cref="ChangePaymentStatus"/>, que además la borra al
        /// volver a <see cref="OrderPaymentStatus.Pending"/> —un pedido pendiente no puede
        /// conservar la fecha de un pago que ya no tiene— y NO la mueve si el pedido ya estaba
        /// pagado, para que la fecha sea la del primer cobro y no la de un segundo clic.
        /// </summary>
        public DateTime? PaidAt { get; private set; }
        /// <summary>Nombre de quien pide. null en las ventas del POS.</summary>
        public string? CustomerName { get; set; }
        /// <summary>Teléfono de quien pide. null en las ventas del POS.</summary>
        public string? CustomerPhone { get; set; }
        /// <summary>Domicilio: obligatorio solo con <see cref="OrderDeliveryType.Delivery"/>.</summary>
        public string? DeliveryAddress { get; set; }
        /// <summary>Notas del pedido (la vía del POS usa <see cref="Description"/>).</summary>
        public string? Notes { get; set; }
        /// <summary>
        /// Razón por la que el pedido se canceló, en texto libre. Solo tiene valor cuando
        /// <see cref="Status"/> es <see cref="OrderStatus.Cancelado"/>: la escribe
        /// <see cref="ChangeStatus"/> y no se puede fijar a mano.
        /// </summary>
        public string? CancellationReason { get; set; }
        /// <summary>Repartidor asignado (F7). null hasta que se asigne.</summary>
        public Guid? DriverId { get; set; }
        /// <summary>Repartidor asignado (F7).</summary>
        public DeliveryDriver? Driver { get; set; }

        private Order(Guid id, Guid storeId, OrderType orderType, string description, decimal total, int itemsCount, DateTime date, Guid tenantId)
            : base(id)
        {
            StoreId = storeId;
            OrderType = orderType;
            Description = description;
            Total = total;
            ItemsCount = itemsCount;
            Date = date;
            TenantId = tenantId;
            OrderItems = new List<OrderItem>();
            Payments = new List<OrderPayment>();
        }

        private static Order Create(Guid id, Guid storeId, OrderType orderType, string description, decimal total, int itemsCount, DateTime date, Guid tenantId)
        {
            var order = new Order(id, storeId, orderType, description, total, itemsCount, date, tenantId);
            order.Raise(new OrderCreatedDomainEvent(order.Id, storeId));
            return order;
        }

        public static Order Create(Guid storeId, OrderType orderType, string description, decimal total, int itemsCount, DateTime date, Guid tenantId)
        {
            return Create(Guid.NewGuid(), storeId, orderType, description, total, itemsCount, date, tenantId);
        }

        /// <summary>
        /// Crea un pedido ONLINE ya con su estado inicial y su snapshot de líneas (D6).
        ///
        /// Las líneas entran YA RESUELTAS por el servidor (id, nombre, precio y moneda leídos del
        /// catálogo) y `total` es el que el servidor calculó: esta factoría no recibe precios del
        /// cliente, y por eso no puede "inventar" un total. El precio de cada <see cref="OrderItem"/>
        /// es el snapshot histórico, así que un cambio posterior del catálogo no altera el pedido.
        ///
        /// Es una vía SEPARADA de <see cref="Create(...)"/> a propósito: la del POS no cambia de
        /// firma ni de comportamiento (criterio de aceptación 1).
        /// </summary>
        public static Order CreateOnline(
            Guid storeId,
            Guid tenantId,
            string code,
            OrderDeliveryType deliveryType,
            string customerName,
            string customerPhone,
            decimal total,
            Currency currency,
            IReadOnlyCollection<OrderLine> lines,
            string? description = null,
            string? deliveryAddress = null,
            string? notes = null,
            DateTime? date = null)
        {
            var order = new Order(
                Guid.NewGuid(), storeId, OrderType.WhatsApp,
                description ?? string.Empty, total,
                lines.Sum(line => line.Quantity),
                date ?? DateTime.UtcNow, tenantId);

            order.Currency = currency;
            order.Code = code;
            order.DeliveryType = deliveryType;
            order.Status = OrderStatus.Creado;
            order.PaymentStatus = OrderPaymentStatus.Pending;
            order.CustomerName = customerName;
            order.CustomerPhone = customerPhone;
            order.DeliveryAddress = deliveryAddress;
            order.Notes = notes;

            int orderIndex = 0;
            foreach (OrderLine line in lines)
            {
                OrderItem item = OrderItem.Create(
                    order.Id, line.ProductId, line.Name, line.Quantity, line.Price, orderIndex++, tenantId,
                    line.BasePrice, line.PercentDiscountPrice, line.DiscountPrice);
                item.Currency = line.Currency;
                order.OrderItems.Add(item);
            }

            order.Raise(new OrderCreatedDomainEvent(order.Id, storeId));
            return order;
        }

        /// <summary>
        /// Mueve el pedido por la tabla de estados. Es la ÚNICA puerta: nadie asigna
        /// <see cref="Status"/> a mano, así que ningún handler puede saltarse la máquina.
        ///
        ///   Creado       → Preparado, Cancelado
        ///   Preparado    → Transportando (solo Delivery), Entregado (solo Pickup), Cancelado
        ///   Transportando → Entregado, Cancelado
        ///   Entregado    → (terminal)
        ///   Cancelado    → (terminal)
        ///
        /// Reglas que esta puerta hace cumplir, además de la tabla:
        ///
        ///   * Cancelar exige una razón de texto libre, no vacía; se guarda en
        ///     <see cref="CancellationReason"/>. Una razón recibida en cualquier otra transición es
        ///     un error del llamador, no algo que se ignore en silencio.
        ///   * Pasar a <see cref="OrderStatus.Transportando"/> exige el repartidor y lo asigna.
        ///   * Pasar a <see cref="OrderStatus.Entregado"/> deja el pedido pagado.
        ///
        /// Cualquier otra transición lanza <see cref="InvalidOrderStatusTransitionException"/> y NO
        /// toca el estado.
        /// </summary>
        /// <param name="next">Estado de destino.</param>
        /// <param name="driverId">Repartidor. Obligatorio con <see cref="OrderStatus.Transportando"/>.</param>
        /// <param name="cancellationReason">Razón. Obligatoria con <see cref="OrderStatus.Cancelado"/>.</param>
        public void ChangeStatus(
            OrderStatus next,
            Guid? driverId = null,
            string? cancellationReason = null)
        {
            if (!AllowedTransitionsFrom(Status, DeliveryType).Contains(next))
                throw new InvalidOrderStatusTransitionException(Status, next);

            if (next != OrderStatus.Cancelado && cancellationReason is not null)
                throw new UnexpectedStatusOptionException(next, nameof(cancellationReason));

            if (next != OrderStatus.Transportando && driverId is not null)
                throw new UnexpectedStatusOptionException(next, nameof(driverId));

            if (next == OrderStatus.Cancelado)
            {
                string reason = cancellationReason?.Trim() ?? string.Empty;
                if (reason.Length == 0)
                    throw new MissingCancellationReasonException(Status);

                CancellationReason = reason;
            }

            if (next == OrderStatus.Transportando)
            {
                if (driverId is null || driverId == Guid.Empty)
                    throw new MissingDeliveryDriverException(Status);

                DriverId = driverId;
            }

            Status = next;

            // Entregar equivale a haber cobrado: el pago deja de ser un eje que alguien pueda
            // dejar en Pending por descuido. Pasa por la MISMA puerta que el pago manual, así que
            // el cobro deja también su constancia (`PaidAt`).
            if (next == OrderStatus.Entregado)
                ChangePaymentStatus(OrderPaymentStatus.Paid);
        }

        /// <summary>
        /// Los estados alcanzables desde <paramref name="status"/> (vacío = terminal).
        ///
        /// Depende del tipo de entrega porque <see cref="OrderStatus.Transportando"/> sólo existe
        /// con <see cref="OrderDeliveryType.Delivery"/>: en recogida,
        /// <see cref="OrderStatus.Preparado"/> pasa directo a <see cref="OrderStatus.Entregado"/>.
        /// </summary>
        public static IReadOnlyList<OrderStatus> AllowedTransitionsFrom(
            OrderStatus status, OrderDeliveryType deliveryType) => status switch
        {
            OrderStatus.Creado => [OrderStatus.Preparado, OrderStatus.Cancelado],
            OrderStatus.Preparado => deliveryType == OrderDeliveryType.Delivery
                ? [OrderStatus.Transportando, OrderStatus.Cancelado]
                : [OrderStatus.Entregado, OrderStatus.Cancelado],
            OrderStatus.Transportando => [OrderStatus.Entregado, OrderStatus.Cancelado],
            OrderStatus.Entregado => [],
            OrderStatus.Cancelado => [],
            _ => throw new InvalidOrderStatusTransitionException(status, status),
        };

        /// <summary>
        /// Cambia el pago del pedido. Sigue siendo un eje independiente del estado —un pedido en
        /// <see cref="OrderStatus.Creado"/> puede estar pagado por adelantado—, con UNA excepción:
        /// un pedido <see cref="OrderStatus.Entregado"/> ya está pagado por definición, así que
        /// devolverlo a <see cref="OrderPaymentStatus.Pending"/> sería contradecir la entrega.
        ///
        /// Es también la ÚNICA puerta de <see cref="PaidAt"/>: sellar al entrar en
        /// <see cref="OrderPaymentStatus.Paid"/> y borrar al volver a
        /// <see cref="OrderPaymentStatus.Pending"/>. Un segundo "pagado" sobre un pedido que ya lo
        /// estaba conserva la fecha (la del primer cobro) en vez de moverla.
        /// </summary>
        public void ChangePaymentStatus(OrderPaymentStatus next)
        {
            if (Status == OrderStatus.Entregado && next == OrderPaymentStatus.Pending)
                throw new DeliveredOrderCannotBeUnpaidException();

            if (next == OrderPaymentStatus.Paid)
            {
                if (PaymentStatus != OrderPaymentStatus.Paid)
                    PaidAt = DateTime.UtcNow;
            }
            else if (next == OrderPaymentStatus.Pending)
            {
                PaidAt = null;
            }

            PaymentStatus = next;
        }
    }

    public sealed record OrderCreatedDomainEvent(Guid OrderId, Guid StoreId) : IDomainEvent;

    /// <summary>
    /// Línea de pedido YA resuelta por el servidor: lo que el catálogo dice del producto, no lo que
    /// envió el cliente. Es el snapshot que se persiste en <c>OrderItem</c> (D6).
    /// </summary>
    /// <summary>
    /// Línea ya resuelta por el servidor. `Price` es el precio final cobrado; los tres campos
    /// opcionales son el snapshot del precio del producto en ese momento (base, % de descuento
    /// escalado y descuento fijo escalado), que permite recalcularlo desde la línea.
    /// </summary>
    public sealed record OrderLine(
        Guid ProductId,
        string Name,
        int Quantity,
        decimal Price,
        Currency Currency,
        decimal? BasePrice = null,
        int? PercentDiscountPrice = null,
        int? DiscountPrice = null);

    /// <summary>
    /// Transición de estado no permitida por la tabla de <see cref="Order.AllowedTransitionsFrom"/>.
    ///
    /// Es de DOMINIO, no `Application.Exceptions.ApiException`: `Domain` no puede referenciar
    /// `Application` (la dependencia va en el sentido contrario), y meter `ApiException` aquí
    /// invertiría la capa. El handler de aplicación que mueva el estado es quien la traduce a un
    /// `ApiException(..., HttpStatusCode.BadRequest)`, que es lo que el cliente ve como 400.
    /// </summary>
    public sealed class InvalidOrderStatusTransitionException : Exception
    {
        public InvalidOrderStatusTransitionException(OrderStatus from, OrderStatus to)
            : base($"Invalid order status transition from '{from}' to '{to}'.")
        {
            From = from;
            To = to;
        }

        /// <summary>Estado en el que estaba el pedido.</summary>
        public OrderStatus From { get; }

        /// <summary>Estado que se pidió y no es alcanzable.</summary>
        public OrderStatus To { get; }
    }

    /// <summary>
    /// Se pidió cancelar sin una razón de texto libre. Cancelar sin motivo deja un pedido muerto
    /// que nadie puede auditar, así que el dominio no lo permite.
    ///
    /// Igual que <see cref="InvalidOrderStatusTransitionException"/>, es una excepción de DOMINIO y
    /// el handler que traduce a HTTP la convierte en un 400.
    /// </summary>
    public sealed class MissingCancellationReasonException : Exception
    {
        public MissingCancellationReasonException(OrderStatus from)
            : base($"Cancelling an order from status '{from}' requires a non-empty cancellation reason.")
        {
            From = from;
        }

        /// <summary>Estado en el que estaba el pedido.</summary>
        public OrderStatus From { get; }
    }

    /// <summary>
    /// Se pidió pasar a <see cref="OrderStatus.Transportando"/> sin repartidor. Un pedido en
    /// reparto sin repartidor no se puede seguir, así que la transición no se aplica.
    /// </summary>
    public sealed class MissingDeliveryDriverException : Exception
    {
        public MissingDeliveryDriverException(OrderStatus from)
            : base($"Moving an order from status '{from}' to 'Transportando' requires a delivery driver.")
        {
            From = from;
        }

        /// <summary>Estado en el que estaba el pedido.</summary>
        public OrderStatus From { get; }
    }

    /// <summary>
    /// El llamador mandó un dato que la transición pedida no usa (una razón al no cancelar, o un
    /// repartidor al no pasar a reparto).
    ///
    /// Se lanza en vez de ignorarlo a propósito: aceptar el dato en silencio y no guardarlo hace
    /// creer al cliente que se aplicó, y el error aparece mucho después, en forma de pedido sin
    /// razón o sin repartidor.
    /// </summary>
    public sealed class UnexpectedStatusOptionException : Exception
    {
        public UnexpectedStatusOptionException(OrderStatus next, string option)
            : base($"Option '{option}' is not used when moving an order to status '{next}'.")
        {
            Next = next;
            Option = option;
        }

        /// <summary>Estado de destino de la transición.</summary>
        public OrderStatus Next { get; }

        /// <summary>Nombre del dato que no aplica.</summary>
        public string Option { get; }
    }

    /// <summary>
    /// Se intentó devolver a <see cref="OrderPaymentStatus.Pending"/> un pedido ya
    /// <see cref="OrderStatus.Entregado"/>. Entregar equivale a cobrar: el pago de un pedido
    /// entregado no se deshace desde el panel.
    /// </summary>
    public sealed class DeliveredOrderCannotBeUnpaidException : Exception
    {
        public DeliveredOrderCannotBeUnpaidException()
            : base("A delivered order is paid by definition and cannot be set back to pending.")
        {
        }
    }

}