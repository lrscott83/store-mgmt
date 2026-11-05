using Domain.Entities.Products;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Escalones de precio mayorista de un producto (N filas por producto).
    ///
    /// Lo que este archivo fija por encima del default:
    ///
    ///   * El filtro global por tenant, IGUAL que el del producto y el de su galería: hoy todas las
    ///     lecturas pasan por el producto, pero un `DbSet` sin filtro sería una puerta abierta a
    ///     leer escalones de otra tienda en cuanto alguien lo consultara directo.
    ///   * Índice por `ProductId`: los escalones se leen siempre por producto.
    ///   * Índice ÚNICO por `(ProductId, MinPacks)`: dos escalones con el mismo mínimo son
    ///     ambiguos —la regla del POS se queda con uno y pierde el otro en silencio—, así que es un
    ///     error de base, no un dato raro.
    ///   * `decimal(18,2)` en el precio: es dinero y se compara contra el total que el catálogo
    ///     redondea a 2 decimales (`CatalogPricing` / `WholesalePricing`).
    /// </summary>
    internal sealed class ProductWholesaleTierEntityTypeConfiguration
        : IEntityTypeConfiguration<ProductWholesaleTier>
    {
        private readonly ApplicationDbContext _context;

        public ProductWholesaleTierEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<ProductWholesaleTier> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.ProductId);
            builder.HasIndex(x => new { x.ProductId, x.MinPacks }).IsUnique();

            builder.HasKey(x => x.Id);

            builder.Property(x => x.MinPacks).IsRequired();
            builder.Property(x => x.PricePerUnit).HasColumnType("decimal(18,2)").IsRequired();

            // El dueño de la relación (`Product.WholesaleTiers`) ya define el cascade.
        }
    }
}
