using Domain.Entities.ProductSalesCommissions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Configuración de comisión por producto del módulo Gestores de ventas. Tabla propia:
    /// `Product` no recibe columnas. Un producto tiene 0..1 configuración (índice único).
    /// </summary>
    internal sealed class ProductSalesCommissionEntityTypeConfiguration
        : IEntityTypeConfiguration<ProductSalesCommission>
    {
        private readonly ApplicationDbContext _context;

        public ProductSalesCommissionEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<ProductSalesCommission> builder)
        {
            builder.ToTable("ProductSalesCommission");
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);

            builder.HasKey(x => x.Id);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);
            builder.HasIndex(x => x.ProductId).IsUnique();

            // El % (0..100) o el monto fijo por unidad. El default del contexto es decimal(18,6);
            // se deja así para no perder precisión en el porcentaje.
            builder.Property(x => x.Type).IsRequired();
            builder.Property(x => x.Currency).IsRequired();

            builder.HasOne(x => x.Store)
                .WithMany()
                .HasForeignKey(x => x.StoreId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
