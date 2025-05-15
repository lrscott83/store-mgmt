using Domain.Entities.Tenants;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.StoreRoleFeatures;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StoreRoleFeatureEntityTypeConfiguration : IEntityTypeConfiguration<StoreRoleFeature>
    {
        private readonly ApplicationDbContext _context;
        public StoreRoleFeatureEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StoreRoleFeature> builder)
        {
            builder.HasQueryFilter(x => (x.TenantId == _context.TenantId || _context.IsSuperAdmin));
            builder.HasIndex(x => x.TenantId);

            builder.HasKey(x => new { x.StoreId, x.RoleId, x.FeatureId });
        }
    }
}
