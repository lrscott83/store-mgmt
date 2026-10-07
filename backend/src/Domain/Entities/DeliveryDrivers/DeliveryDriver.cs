using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Stores;

namespace Domain.Entities.DeliveryDrivers
{
    /// <summary>
    /// Repartidor de una tienda (decisión D5: tabla propia, no una columna de texto en la tienda).
    ///
    /// Se asigna a un pedido online por <c>Order.DriverId</c> (F7). <see cref="AuditableEntity.IsActive"/>
    /// es la baja lógica: un repartidor que se va deja de salir en las listas pero no se borra, para
    /// que los pedidos que ya entregó conserven su referencia.
    /// </summary>
    public sealed class DeliveryDriver : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public string Name { get; set; }
        public string Phone { get; set; }
        public Guid TenantId { get; set; }

        private DeliveryDriver(Guid id, Guid storeId, string name, string phone, Guid tenantId) : base(id)
        {
            StoreId = storeId;
            Name = name;
            Phone = phone;
            TenantId = tenantId;
        }

        public static DeliveryDriver Create(Guid storeId, string name, string phone, Guid tenantId)
        {
            var driver = new DeliveryDriver(Guid.NewGuid(), storeId, name, phone, tenantId);
            driver.Raise(new DeliveryDriverCreatedDomainEvent(driver.Id, storeId));
            return driver;
        }
    }

    public sealed record DeliveryDriverCreatedDomainEvent(Guid DeliveryDriverId, Guid StoreId) : IDomainEvent;
}