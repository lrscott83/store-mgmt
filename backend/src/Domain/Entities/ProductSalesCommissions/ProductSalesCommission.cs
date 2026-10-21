using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Entities.Products;
using Domain.Entities.Stores;

namespace Domain.Entities.ProductSalesCommissions
{
    /// <summary>
    /// Configuración de comisión de UN producto para los gestores de ventas. Vive en una tabla
    /// propia del módulo: `Product` no recibe columnas por este feature.
    ///
    /// Regla (owner, 2026-10-21): el tipo es porcentaje O valor fijo, nunca ambos. La moneda es
    /// la moneda de pago de la comisión y NO se convierte: si no coincide con la del pedido, se
    /// muestra la comisión en esta moneda.
    /// </summary>
    public sealed class ProductSalesCommission : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;

        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;

        public SalesCommissionType Type { get; set; }

        /// <summary>
        /// Porcentaje (0..100) cuando <see cref="Type"/> es Percentage; monto fijo por unidad
        /// cuando es Fixed. Siempre en <see cref="Currency"/>.
        /// </summary>
        public decimal Value { get; set; }

        public Currency Currency { get; set; }

        public Guid TenantId { get; private set; }

        private ProductSalesCommission(
            Guid id,
            Guid storeId,
            Guid productId,
            SalesCommissionType type,
            decimal value,
            Currency currency,
            Guid tenantId) : base(id)
        {
            StoreId = storeId;
            ProductId = productId;
            Type = type;
            Value = value;
            Currency = currency;
            TenantId = tenantId;
        }

        public static ProductSalesCommission Create(
            Guid storeId,
            Guid productId,
            SalesCommissionType type,
            decimal value,
            Currency currency,
            Guid tenantId)
            => Create(Guid.NewGuid(), storeId, productId, type, value, currency, tenantId);

        public static ProductSalesCommission Create(
            Guid id,
            Guid storeId,
            Guid productId,
            SalesCommissionType type,
            decimal value,
            Currency currency,
            Guid tenantId)
        {
            if (id == Guid.Empty)
                throw new ArgumentException("El id de la configuración es obligatorio.", nameof(id));
            if (storeId == Guid.Empty)
                throw new ArgumentException("La tienda de la configuración es obligatoria.", nameof(storeId));
            if (productId == Guid.Empty)
                throw new ArgumentException("El producto de la configuración es obligatorio.", nameof(productId));
            if (tenantId == Guid.Empty)
                throw new ArgumentException("El tenant de la configuración es obligatorio.", nameof(tenantId));
            if (value < 0)
                throw new ArgumentOutOfRangeException(nameof(value), "La comisión no puede ser negativa.");
            if (type == SalesCommissionType.Percentage && value > 100)
                throw new ArgumentOutOfRangeException(nameof(value), "El porcentaje de comisión no puede superar 100.");

            return new ProductSalesCommission(id, storeId, productId, type, value, currency, tenantId);
        }
    }
}
