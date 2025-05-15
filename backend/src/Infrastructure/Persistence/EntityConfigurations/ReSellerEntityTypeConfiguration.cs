using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ReSellers;
using Domain.Common.Constants;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class ReSellerEntityTypeConfiguration : IEntityTypeConfiguration<ReSeller>
    {
        private readonly ApplicationDbContext _context;
        public ReSellerEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<ReSeller> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || _context.IsReSeller || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);

            builder.HasKey(x => x.Id);
            builder.HasIndex(x => x.UserId).IsUnique();

            builder.HasOne(c => c.User)
             .WithOne(e => e.ReSeller)
             .HasForeignKey<ReSeller>(a => a.UserId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.ReSellerOwners)
             .WithOne(e => e.ReSeller)
             .HasForeignKey(e => e.ReSellerId)
             .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
