using Domain.Common.Catalog;
using Domain.Entities.WebCatalog;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class CatalogCategoryEntityTypeConfiguration : IEntityTypeConfiguration<CatalogCategory>
    {
        private readonly ApplicationDbContext _context;

        public CatalogCategoryEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<CatalogCategory> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Slug).IsRequired().HasMaxLength(SlugNormalizer.MaxLength);

            // Relación 1:1 con la categoría de origen: es la garantía de idempotencia del sync
            // (re-sincronizar actualiza la fila, nunca crea otra).
            builder.HasIndex(x => new { x.StoreId, x.SourceCategoryId }).IsUnique();
            // Slug único por tienda para la URL pública del catálogo.
            builder.HasIndex(x => new { x.StoreId, x.Slug }).IsUnique();

            builder.HasMany(x => x.Products)
                .WithOne(p => p.CatalogCategory)
                .HasForeignKey(p => p.CatalogCategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
