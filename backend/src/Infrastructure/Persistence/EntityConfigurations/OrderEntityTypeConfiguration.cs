using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ProductCategories;
using Domain.Entities.Orders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class OrderEntityTypeConfiguration : IEntityTypeConfiguration<Order>
    {
        private readonly ApplicationDbContext _context;
        public OrderEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Order> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);

            builder.HasMany(c => c.OrderItems)
                 .WithOne(e => e.Order)
                 .HasForeignKey(e => e.OrderId)
                 .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
