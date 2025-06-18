using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Stores;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StoreEntityTypeConfiguration : IEntityTypeConfiguration<Store>
    {
        private readonly ApplicationDbContext _context;
        public StoreEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Store> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.OwnerId);

            builder.HasKey(x => x.Id);

            builder.HasMany(c => c.StoreUsers)
             .WithOne(e => e.Store)
             .HasForeignKey(e => e.StoreId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.StoreModules)
             .WithOne(e => e.Store)
             .HasForeignKey(e => e.StoreId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.StoreRoleFeatures)
             .WithOne(e => e.Store)
             .HasForeignKey(e => e.StoreId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.StorePayments)
             .WithOne(e => e.Store)
             .HasForeignKey(e => e.StoreId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.InventoryEntries)
             .WithOne(e => e.Store)
             .HasForeignKey(e => e.StoreId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.Orders)
             .WithOne(e => e.Store)
             .HasForeignKey(e => e.StoreId)
             .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
