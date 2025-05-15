using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.Owners;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class ReSellerOwnerEntityTypeConfiguration : IEntityTypeConfiguration<ReSellerOwner>
    {
        private readonly ApplicationDbContext _context;
        public ReSellerOwnerEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<ReSellerOwner> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || _context.IsReSeller || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);

            builder.HasKey(x => new { x.ReSellerId, x.OwnerId });
            builder.HasIndex(x => x.OwnerId).IsUnique();
            builder.HasIndex(x => x.ReSellerId);

            builder.HasOne(c => c.Owner)
             .WithOne(e => e.ReSellerOwner)
             .HasForeignKey<ReSellerOwner>(e => e.OwnerId)
             .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
