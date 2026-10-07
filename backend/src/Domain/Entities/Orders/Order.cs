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
        public OrderStatus Status { get; set; } = OrderStatus.New;
        /// <summary>Pago manual Pendiente/Paid (D3/D12), independiente de <see cref="Status"/>.</summary>
        public OrderPaymentStatus PaymentStatus { get; set; } = OrderPaymentStatus.Pending;
        /// <summary>Nombre de quien pide. null en las ventas del POS.</summary>
        public string? CustomerName { get; set; }
        /// <summary>Teléfono de quien pide. null en las ventas del POS.</summary>
        public string? CustomerPhone { get; set; }
        /// <summary>Domicilio: obligatorio solo con <see cref="OrderDeliveryType.Delivery"/>.</summary>
        public string? DeliveryAddress { get; set; }
        /// <summary>Notas del pedido (la vía del POS usa <see cref="Description"/>).</summary>
        public string? Notes { get; set; }
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
            order.Status = OrderStatus.New;
            order.PaymentStatus = OrderPaymentStatus.Pending;
            order.CustomerName = customerName;
            order.CustomerPhone = customerPhone;
            order.DeliveryAddress = deliveryAddress;
            order.Notes = notes;

            int orderIndex = 0;
            foreach (OrderLine line in lines)
            {
                OrderItem item = OrderItem.Create(
                    order.Id, line.ProductId, line.Name, line.Quantity, line.Price, orderIndex++, tenantId);
                item.Currency = line.Currency;
                order.OrderItems.Add(item);
            }

            order.Raise(new OrderCreatedDomainEvent(order.Id, storeId));
            return order;
        }

        /// <summary>
        /// Mueve el pedido por la tabla de estados de la D11. Es la ÚNICA puerta: nadie asigna
        /// <see cref="Status"/> a mano, así que ningún handler puede saltarse la máquina.
        ///
        ///   New       → Accepted, Cancelled
        ///   Accepted  → Preparing, Cancelled
        ///   Preparing → Ready, Cancelled
        ///   Ready     → Delivered, Cancelled
        ///   Delivered → (terminal)
        ///   Cancelled → (terminal)
        ///
        /// No existe "En camino" (D18) y los estados terminales no se mueven. Cualquier otra
        /// transición lanza <see cref="InvalidOrderStatusTransitionException"/> y NO toca el estado.
        /// </summary>
        public void ChangeStatus(OrderStatus next)
        {
            if (!AllowedTransitionsFrom(Status).Contains(next))
                throw new InvalidOrderStatusTransitionException(Status, next);

            Status = next;
        }

        /// <summary>Los estados alcanzables desde <paramref name="status"/> (vacío = terminal).</summary>
        public static IReadOnlyList<OrderStatus> AllowedTransitionsFrom(OrderStatus status) => status switch
        {
            OrderStatus.New => [OrderStatus.Accepted, OrderStatus.Cancelled],
            OrderStatus.Accepted => [OrderStatus.Preparing, OrderStatus.Cancelled],
            OrderStatus.Preparing => [OrderStatus.Ready, OrderStatus.Cancelled],
            OrderStatus.Ready => [OrderStatus.Delivered, OrderStatus.Cancelled],
            OrderStatus.Delivered => [],
            OrderStatus.Cancelled => [],
            _ => throw new InvalidOrderStatusTransitionException(status, status),
        };
    }

    public sealed record OrderCreatedDomainEvent(Guid OrderId, Guid StoreId) : IDomainEvent;

    /// <summary>
    /// Línea de pedido YA resuelta por el servidor: lo que el catálogo dice del producto, no lo que
    /// envió el cliente. Es el snapshot que se persiste en <c>OrderItem</c> (D6).
    /// </summary>
    public sealed record OrderLine(Guid ProductId, string Name, int Quantity, decimal Price, Currency Currency);

    /// <summary>
    /// Transición de estado no permitida por la tabla de la D11.
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

}