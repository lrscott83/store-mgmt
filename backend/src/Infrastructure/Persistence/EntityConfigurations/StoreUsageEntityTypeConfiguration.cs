using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.StoreUsages;
using Domain.Entities.Owners;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StoreUsageEntityTypeConfiguration : IEntityTypeConfiguration<StoreUsage>
    {
        private readonly ApplicationDbContext _context;
        public StoreUsageEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StoreUsage> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin);
            builder.HasKey(x => x.Id);
            builder.HasIndex(x => new { x.UserId, x.StoreId });

            builder.HasOne(c => c.User)
             .WithMany(e => e.StoreUsages)
             .HasForeignKey(a => a.UserId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(c => c.Store)
             .WithMany(e => e.StoreUsages)
             .HasForeignKey(a => a.StoreId)
             .OnDelete(DeleteBehavior.Restrict);

        }
    }
}
