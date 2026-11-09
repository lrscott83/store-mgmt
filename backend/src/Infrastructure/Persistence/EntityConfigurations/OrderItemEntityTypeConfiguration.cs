using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Common.Limits;
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

            // The wholesale snapshot is read back from the persisted row, so the shapes are bounded
            // here: the unit label is presentation text (same cap as the product's) and the tier
            // price is money, which every money column in this schema stores as decimal(18,2)
            // (the context default for decimals is decimal(18,6)).
            builder.Property(x => x.WholesaleUnitLabel).HasMaxLength(ProductEntityLimits.WholesaleUnitLabelMaxLength);
            builder.Property(x => x.WholesaleTierUnitPrice).HasColumnType("decimal(18,2)");

            builder.HasMany(c => c.InventoryProductCosts)
                 .WithOne(e => e.OrderItem)
                 .HasForeignKey(e => e.OrderItemId)
                 .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
