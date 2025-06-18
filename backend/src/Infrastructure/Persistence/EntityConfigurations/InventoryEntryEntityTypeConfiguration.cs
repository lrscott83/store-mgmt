using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ProductCategories;
using Domain.Entities.InventoryEntries;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class InventoryEntryEntityTypeConfiguration : IEntityTypeConfiguration<InventoryEntry>
    {
        private readonly ApplicationDbContext _context;
        public InventoryEntryEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<InventoryEntry> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);

            builder.HasMany(c => c.InventoryEntryCosts)
             .WithOne(e => e.InventoryEntry)
             .HasForeignKey(e => e.InventoryEntryId)
             .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
