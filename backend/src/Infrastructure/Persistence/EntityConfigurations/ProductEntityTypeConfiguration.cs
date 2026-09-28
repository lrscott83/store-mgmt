using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Common.Limits;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class ProductEntityTypeConfiguration : IEntityTypeConfiguration<Product>
    {
        private readonly ApplicationDbContext _context;
        public ProductEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Product> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.CategoryId);

            builder.HasKey(x => x.Id);

            // Campos del catálogo web (plan 2026-09-27).
            builder.Property(x => x.Description).HasMaxLength(ProductEntityLimits.DescriptionMaxLength).HasDefaultValue(string.Empty);
            builder.Property(x => x.PercentDiscountPrice).HasDefaultValue(0);
            builder.Property(x => x.DiscountPrice).HasDefaultValue(0);
            builder.Property(x => x.IsNew).HasDefaultValue(false);
            builder.Property(x => x.Image).HasMaxLength(ProductEntityLimits.ImagePathMaxLength);

            // Propiedades calculadas: no se persisten.
            builder.Ignore(x => x.FinalPrice);
            builder.Ignore(x => x.HasDiscount);

            builder.HasMany(c => c.Images)
                 .WithOne(i => i.Product)
                 .HasForeignKey(i => i.ProductId)
                 .OnDelete(DeleteBehavior.Cascade);

            builder.HasMany(c => c.InventoryEntries)
                 .WithOne(e => e.Product)
                 .HasForeignKey(e => e.ProductId)
                 .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.OrderItems)
                 .WithOne(e => e.Product)
                 .HasForeignKey(e => e.ProductId)
                 .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
