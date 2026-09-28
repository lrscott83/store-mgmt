using Domain.Common.Limits;
using Domain.Entities.WebCatalog;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class CatalogProductImageEntityTypeConfiguration : IEntityTypeConfiguration<CatalogProductImage>
    {
        private readonly ApplicationDbContext _context;

        public CatalogProductImageEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<CatalogProductImage> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.CatalogProductId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Path).IsRequired().HasMaxLength(ProductEntityLimits.ImagePathMaxLength);
            builder.Property(x => x.Order).HasDefaultValue(0);
        }
    }
}
