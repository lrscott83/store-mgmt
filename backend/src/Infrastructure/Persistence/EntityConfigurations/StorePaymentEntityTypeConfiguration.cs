using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.StorePayments;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StorePaymentEntityTypeConfiguration : IEntityTypeConfiguration<StorePayment>
    {
        private readonly ApplicationDbContext _context;
        public StorePaymentEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StorePayment> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || _context.IsReSeller || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);
        }
    }
}
