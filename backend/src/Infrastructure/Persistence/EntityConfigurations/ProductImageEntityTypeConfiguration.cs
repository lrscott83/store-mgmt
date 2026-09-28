using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Common.Limits;
using Domain.Entities.Products;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class ProductImageEntityTypeConfiguration : IEntityTypeConfiguration<ProductImage>
    {
        private readonly ApplicationDbContext _context;
        public ProductImageEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<ProductImage> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.ProductId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Path)
                .IsRequired()
                .HasMaxLength(ProductEntityLimits.ImagePathMaxLength);
            builder.Property(x => x.Order).HasDefaultValue(0);

            // El dueño de la relación (Product.Images) ya define el cascade.
        }
    }
}
