using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.UserRoles;
using static Domain.Common.Constants.DataUtils;
using Domain.Common.Enums;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class UserRoleEntityTypeConfiguration : IEntityTypeConfiguration<UserRole>
    {
        private readonly ApplicationDbContext _context;
        public UserRoleEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<UserRole> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);

            builder.HasKey(x => new { x.UserId, x.RoleId });

            UserRole adminRole = UserRole.Create(SuperAdminUser.Id, (int)RoleType.SuperAdmin, DefaultTenant.Id);
            adminRole.CreatedDate = new DateTimeOffset(new DateTime(2025, 4, 13, 18, 50, 15, 487, DateTimeKind.Unspecified).AddTicks(4417));
            builder.HasData(adminRole);

        }
    }
}
