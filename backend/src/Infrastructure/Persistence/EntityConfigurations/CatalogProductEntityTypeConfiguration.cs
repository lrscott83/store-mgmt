using Domain.Common.Catalog;
using Domain.Common.Limits;
using Domain.Entities.WebCatalog;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class CatalogProductEntityTypeConfiguration : IEntityTypeConfiguration<CatalogProduct>
    {
        private readonly ApplicationDbContext _context;

        public CatalogProductEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<CatalogProduct> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);
            builder.HasIndex(x => x.CatalogCategoryId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Description).HasMaxLength(ProductEntityLimits.DescriptionMaxLength).HasDefaultValue(string.Empty);
            builder.Property(x => x.Image).HasMaxLength(ProductEntityLimits.ImagePathMaxLength);
            builder.Property(x => x.PercentDiscountPrice).HasDefaultValue(0);
            builder.Property(x => x.DiscountPrice).HasDefaultValue(0);
            builder.Property(x => x.IsNew).HasDefaultValue(false);
            builder.Property(x => x.SyncedAt).HasDefaultValueSql("NOW()");

            // Propiedades calculadas: no se persisten.
            builder.Ignore(x => x.FinalPrice);
            builder.Ignore(x => x.HasDiscount);

            // Relación 1:1 con el producto de origen (idempotencia del sync).
            builder.HasIndex(x => new { x.StoreId, x.SourceProductId }).IsUnique();

            builder.HasMany(x => x.Images)
                .WithOne(i => i.CatalogProduct)
                .HasForeignKey(i => i.CatalogProductId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
