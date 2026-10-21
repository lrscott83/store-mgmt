using Domain.Common.Entities;
using Domain.Entities.Orders;
using Domain.Entities.Owners;
using Domain.Entities.SalesManagers;
using Domain.Entities.Stores;

namespace Domain.Entities.OrderSalesManagers
{
    /// <summary>
    /// Atribución de UN pedido a UN gestor de ventas. Vive en una tabla propia del módulo: no
    /// se añade una columna a `Order`. Es la base para que T6 genere la comisión al entregar.
    ///
    /// `OrderId` es único: un pedido tiene como máximo un gestor atribuido. El gestor pertenece
    /// al Owner de la tienda; la validación de esa pertenencia la hace el handler de alta (T5b).
    /// </summary>
    public sealed class OrderSalesManager : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid OrderId { get; set; }
        public Order Order { get; set; } = null!;

        public Guid SalesManagerId { get; set; }
        public SalesManager SalesManager { get; set; } = null!;

        public Guid OwnerId { get; set; }
        public Owner Owner { get; set; } = null!;

        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;

        public Guid TenantId { get; private set; }

        private OrderSalesManager(
            Guid id,
            Guid orderId,
            Guid salesManagerId,
            Guid ownerId,
            Guid storeId,
            Guid tenantId) : base(id)
        {
            OrderId = orderId;
            SalesManagerId = salesManagerId;
            OwnerId = ownerId;
            StoreId = storeId;
            TenantId = tenantId;
        }

        public static OrderSalesManager Create(
            Guid orderId,
            Guid salesManagerId,
            Guid ownerId,
            Guid storeId,
            Guid tenantId)
            => Create(Guid.NewGuid(), orderId, salesManagerId, ownerId, storeId, tenantId);

        public static OrderSalesManager Create(
            Guid id,
            Guid orderId,
            Guid salesManagerId,
            Guid ownerId,
            Guid storeId,
            Guid tenantId)
        {
            if (id == Guid.Empty)
                throw new ArgumentException("El id de la atribución es obligatorio.", nameof(id));
            if (orderId == Guid.Empty)
                throw new ArgumentException("El pedido de la atribución es obligatorio.", nameof(orderId));
            if (salesManagerId == Guid.Empty)
                throw new ArgumentException("El gestor de la atribución es obligatorio.", nameof(salesManagerId));
            if (ownerId == Guid.Empty)
                throw new ArgumentException("El Owner de la atribución es obligatorio.", nameof(ownerId));
            if (storeId == Guid.Empty)
                throw new ArgumentException("La tienda de la atribución es obligatoria.", nameof(storeId));
            if (tenantId == Guid.Empty)
                throw new ArgumentException("El tenant de la atribución es obligatorio.", nameof(tenantId));

            return new OrderSalesManager(id, orderId, salesManagerId, ownerId, storeId, tenantId);
        }
    }
}
