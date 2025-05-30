using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
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
            builder.HasQueryFilter(x => x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.CategoryId);

            builder.HasKey(x => x.Id);

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
