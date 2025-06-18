using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.ProductCategories;
using Domain.Entities.InventoryEntries;
using Domain.Entities.InventoryEntryCosts;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class InventoryEntryCostEntityTypeConfiguration : IEntityTypeConfiguration<InventoryEntryCost>
    {
        private readonly ApplicationDbContext _context;
        public InventoryEntryCostEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<InventoryEntryCost> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.InventoryEntryId);
            builder.HasIndex(x => x.OrderItemId);

            builder.HasKey(x => x.Id);
        }
    }
}
