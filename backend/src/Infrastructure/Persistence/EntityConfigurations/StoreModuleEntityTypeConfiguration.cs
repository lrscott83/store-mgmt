using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.StoreModules;
using Application.Abstractions.HttpContext;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StoreModuleEntityTypeConfiguration : IEntityTypeConfiguration<StoreModule>
    {
        private readonly ApplicationDbContext _context;
        private readonly IHttpContextService _httpContextService;
        public StoreModuleEntityTypeConfiguration(ApplicationDbContext context, IHttpContextService httpContextService)
        {
            _context = context;
            _httpContextService = httpContextService;
        }

        public void Configure(EntityTypeBuilder<StoreModule> builder)
        {
            builder.HasQueryFilter(x => (_context.IsSuperAdmin || x.TenantId == _context.TenantId));
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => new { x.StoreId, x.ModuleId });
        }
    }
}
