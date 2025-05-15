using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Owners;
using Domain.Common.Constants;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class OwnerEntityTypeConfiguration : IEntityTypeConfiguration<Owner>
    {
        private readonly ApplicationDbContext _context;
        public OwnerEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Owner> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || _context.IsReSeller || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);

            builder.HasKey(x => x.Id);
            builder.HasIndex(x => x.UserId).IsUnique();

            builder.HasOne(c => c.User)
             .WithOne(e => e.Owner)
             .HasForeignKey<Owner>(a => a.UserId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.Stores)
             .WithOne(e => e.Owner)
             .HasForeignKey(e => e.OwnerId)
             .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
