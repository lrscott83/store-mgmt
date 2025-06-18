using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ProductCategories;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class ProductCategoryEntityTypeConfiguration : IEntityTypeConfiguration<ProductCategory>
    {
        private readonly ApplicationDbContext _context;
        public ProductCategoryEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<ProductCategory> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);

            builder.HasOne(pc => pc.Store)
                .WithMany(s => s.ProductCategories)
                .HasForeignKey(pc => pc.StoreId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.Products)
                 .WithOne(e => e.Category)
                 .HasForeignKey(e => e.CategoryId)
                 .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
