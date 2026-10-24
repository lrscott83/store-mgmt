using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using Domain.Entities.Owners;
using Domain.Entities.SalesManagers;
using Domain.Entities.Stores;
using Domain.Entities.Users;

namespace Domain.Entities.OrderSalesCommissions
{
    /// <summary>
    /// Comisión generada por UNA línea de pedido (<c>OrderItem</c>) para un gestor de ventas.
    ///
    /// - Una fila por <c>OrderItemId</c> (índice único): reentregar o reintentar no duplica.
    /// - Guarda el snapshot del cálculo (`Type`, `Value`, `UnitPrice`, `Quantity`, `Amount` y
    ///   `Currency`) y referencia el `OrderItem`, cuyo snapshot de precio (base, % descuento,
    ///   descuento fijo y moneda) es la fuente.
    /// - No se convierte moneda: `Currency` es la moneda configurada del producto.
    /// - El pago es completo y lo registra el Owner; `MarkPaid` es la única puerta.
    ///
    /// Nace solo cuando la tienda tiene el módulo activo y el pedido pasó a `Entregado`
    /// (S5/S10). Esta entidad no conoce el módulo: la puerta vive en el handler.
    /// </summary>
    public sealed class OrderSalesCommission : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid OrderId { get; set; }
        public Order Order { get; set; } = null!;

        public Guid OrderItemId { get; set; }
        public OrderItem OrderItem { get; set; } = null!;

        public Guid SalesManagerId { get; set; }
        public SalesManager SalesManager { get; set; } = null!;

        public Guid OwnerId { get; set; }
        public Owner Owner { get; set; } = null!;

        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;

        /// <summary>Snapshot del tipo de comisión vigente al entregar.</summary>
        public SalesCommissionType Type { get; set; }

        /// <summary>Snapshot del valor configurado (porcentaje 0..100 o monto fijo por unidad).</summary>
        public decimal Value { get; set; }

        /// <summary>Precio final unitario del `OrderItem` al generar la comisión.</summary>
        public decimal UnitPrice { get; set; }

        /// <summary>Cantidad de la línea; el valor fijo se multiplica por ella.</summary>
        public int Quantity { get; set; }

        /// <summary>Comisión total de la línea (unitario × cantidad, ya calculada y redondeada).</summary>
        public decimal Amount { get; set; }

        public Currency Currency { get; set; }

        public SalesCommissionStatus Status { get; set; } = SalesCommissionStatus.Pending;

        public DateTimeOffset? PaidAt { get; set; }

        public Guid? PaidByUserId { get; set; }
        public User? PaidByUser { get; set; }

        public string? PaymentNote { get; set; }

        public Guid TenantId { get; private set; }

        private OrderSalesCommission(
            Guid id,
            Guid orderId,
            Guid orderItemId,
            Guid salesManagerId,
            Guid ownerId,
            Guid storeId,
            SalesCommissionType type,
            decimal value,
            decimal unitPrice,
            int quantity,
            decimal amount,
            Currency currency,
            Guid tenantId) : base(id)
        {
            OrderId = orderId;
            OrderItemId = orderItemId;
            SalesManagerId = salesManagerId;
            OwnerId = ownerId;
            StoreId = storeId;
            Type = type;
            Value = value;
            UnitPrice = unitPrice;
            Quantity = quantity;
            Amount = amount;
            Currency = currency;
            Status = SalesCommissionStatus.Pending;
            TenantId = tenantId;
        }

        public static OrderSalesCommission Create(
            Guid orderId,
            Guid orderItemId,
            Guid salesManagerId,
            Guid ownerId,
            Guid storeId,
            SalesCommissionType type,
            decimal value,
            decimal unitPrice,
            int quantity,
            decimal amount,
            Currency currency,
            Guid tenantId)
            => Create(Guid.NewGuid(), orderId, orderItemId, salesManagerId, ownerId, storeId,
                type, value, unitPrice, quantity, amount, currency, tenantId);

        public static OrderSalesCommission Create(
            Guid id,
            Guid orderId,
            Guid orderItemId,
            Guid salesManagerId,
            Guid ownerId,
            Guid storeId,
            SalesCommissionType type,
            decimal value,
            decimal unitPrice,
            int quantity,
            decimal amount,
            Currency currency,
            Guid tenantId)
        {
            if (id == Guid.Empty)
                throw new ArgumentException("El id de la comisión es obligatorio.", nameof(id));
            if (orderId == Guid.Empty)
                throw new ArgumentException("El pedido de la comisión es obligatorio.", nameof(orderId));
            if (orderItemId == Guid.Empty)
                throw new ArgumentException("La línea de pedido de la comisión es obligatoria.", nameof(orderItemId));
            if (salesManagerId == Guid.Empty)
                throw new ArgumentException("El gestor de la comisión es obligatorio.", nameof(salesManagerId));
            if (ownerId == Guid.Empty)
                throw new ArgumentException("El Owner de la comisión es obligatorio.", nameof(ownerId));
            if (storeId == Guid.Empty)
                throw new ArgumentException("La tienda de la comisión es obligatoria.", nameof(storeId));
            if (tenantId == Guid.Empty)
                throw new ArgumentException("El tenant de la comisión es obligatorio.", nameof(tenantId));
            if (value < 0)
                throw new ArgumentOutOfRangeException(nameof(value), "La comisión no puede ser negativa.");
            if (type == SalesCommissionType.Percentage && value > 100)
                throw new ArgumentOutOfRangeException(nameof(value), "El porcentaje de comisión no puede superar 100.");
            if (unitPrice < 0)
                throw new ArgumentOutOfRangeException(nameof(unitPrice), "El precio unitario no puede ser negativo.");
            if (quantity <= 0)
                throw new ArgumentOutOfRangeException(nameof(quantity), "La cantidad debe ser mayor que cero.");
            if (amount < 0)
                throw new ArgumentOutOfRangeException(nameof(amount), "El monto de la comisión no puede ser negativo.");

            return new OrderSalesCommission(
                id, orderId, orderItemId, salesManagerId, ownerId, storeId,
                type, value, unitPrice, quantity, amount, currency, tenantId);
        }

        /// <summary>
        /// Registra el pago COMPLETO de la comisión. Solo el Owner llega aquí (T7); una comisión
        /// ya pagada no se vuelve a pagar (pago completo, sin parciales, decisión del owner).
        /// </summary>
        public void MarkPaid(Guid paidByUserId, DateTimeOffset paidAt, string? note)
        {
            if (paidByUserId == Guid.Empty)
                throw new ArgumentException("El usuario que registra el pago es obligatorio.", nameof(paidByUserId));

            if (Status == SalesCommissionStatus.Paid)
                throw new SalesCommissionAlreadyPaidException(Id);

            Status = SalesCommissionStatus.Paid;
            PaidAt = paidAt;
            PaidByUserId = paidByUserId;
            PaymentNote = note;
        }
    }

    /// <summary>Se intentó pagar una comisión que ya estaba pagada.</summary>
    public sealed class SalesCommissionAlreadyPaidException : Exception
    {
        public SalesCommissionAlreadyPaidException(Guid commissionId)
            : base($"La comisión '{commissionId}' ya fue pagada.")
        {
        }
    }
}
