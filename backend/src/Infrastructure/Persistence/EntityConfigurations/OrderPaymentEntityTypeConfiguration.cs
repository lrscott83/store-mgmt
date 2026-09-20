using Domain.Entities.OrderPayments;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class OrderPaymentEntityTypeConfiguration : IEntityTypeConfiguration<OrderPayment>
    {
        private readonly ApplicationDbContext _context;
        public OrderPaymentEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<OrderPayment> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.OrderId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Amount).HasColumnType("decimal(18,2)");
            builder.Property(x => x.RateApplied).HasColumnType("decimal(18,6)");
            builder.Property(x => x.AmountInOrderCurrency).HasColumnType("decimal(18,2)");
        }
    }
}
