using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ProductCategories;
using Domain.Entities.OrderItems;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class OrderItemEntityTypeConfiguration : IEntityTypeConfiguration<OrderItem>
    {
        private readonly ApplicationDbContext _context;
        public OrderItemEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<OrderItem> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.OrderId);

            builder.HasKey(x => x.Id);;

            builder.HasMany(c => c.InventoryProductCosts)
                 .WithOne(e => e.OrderItem)
                 .HasForeignKey(e => e.OrderItemId)
                 .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
