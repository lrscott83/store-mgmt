using Domain.Common.Entities;
using Domain.Common.Enums;

namespace Domain.Entities.Products
{
    /// <summary>
    /// Un ESCALÓN de precio mayorista de un producto: a partir de <see cref="MinPacks"/> paquetes,
    /// la unidad dentro del paquete se cobra a <see cref="PricePerUnit"/>.
    ///
    /// Espejo EXACTO de los escalones del POS (`wholesaleTiers` en el almacén local del
    /// dispositivo): la venta mayorista del POS y el catálogo web tienen que resolver el mismo
    /// precio para el mismo número de paquetes, y la única forma de garantizarlo es que los dos
    /// lean los mismos datos con la misma regla.
    ///
    /// El precio se guarda POR UNIDAD (no por paquete): el total de la línea es
    /// `packs × packSize × pricePerUnit`, la misma fórmula del POS.
    /// </summary>
    public sealed class ProductWholesaleTier : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;

        /// <summary>Mínimo de PAQUETES a partir del cual aplica este escalón.</summary>
        public int MinPacks { get; set; }

        /// <summary>Precio de UNA unidad dentro del paquete, en la moneda del escalón.</summary>
        public decimal PricePerUnit { get; set; }

        /// <summary>Moneda de <see cref="PricePerUnit"/>. Default CUP, igual que el producto.</summary>
        public Currency Currency { get; set; } = Currency.CUP;

        public Guid TenantId { get; set; }

        private ProductWholesaleTier(Guid id, Guid productId, int minPacks, decimal pricePerUnit,
            Currency currency, Guid tenantId) : base(id)
        {
            ProductId = productId;
            MinPacks = minPacks;
            PricePerUnit = pricePerUnit;
            Currency = currency;
            TenantId = tenantId;
        }

        public static ProductWholesaleTier Create(Guid productId, int minPacks, decimal pricePerUnit,
            Currency currency, Guid tenantId)
            => Create(Guid.NewGuid(), productId, minPacks, pricePerUnit, currency, tenantId);

        public static ProductWholesaleTier Create(Guid id, Guid productId, int minPacks, decimal pricePerUnit,
            Currency currency, Guid tenantId)
            => new(id, productId, minPacks, pricePerUnit, currency, tenantId);
    }
}
