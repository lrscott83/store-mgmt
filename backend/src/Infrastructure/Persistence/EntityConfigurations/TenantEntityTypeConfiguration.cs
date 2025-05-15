using Domain.Entities.Tenants;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Common.Constants;
using Domain.Entities.Stores;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class TenantEntityTypeConfiguration : IEntityTypeConfiguration<Tenant>
    {
        private readonly ApplicationDbContext _context;
        public TenantEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Tenant> builder)
        {
            builder.HasQueryFilter(x => x.Id != DataUtils.DefaultTenant.Id);
            builder.HasKey(x => x.Id);

            builder.HasIndex(x => x.Name).IsUnique();

            builder.HasData(Tenant.Create(DataUtils.DefaultTenant.Id, DataUtils.DefaultTenant.Name, 
                "Default Tenant to create Default Store for Super Admin User", ""));
        }
    }
}
