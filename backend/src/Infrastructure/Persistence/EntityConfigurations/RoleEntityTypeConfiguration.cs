using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Roles;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using static Domain.Common.Constants.DataUtils;
using Domain.Common.Constants;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class RoleEntityTypeConfiguration : IEntityTypeConfiguration<Role>
    {
        private readonly ApplicationDbContext _context;
        public RoleEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<Role> builder)
        {
            builder.HasKey(x => x.Id);

            builder.HasMany(c => c.StoreRoleFeatures)
              .WithOne(e => e.Role)
              .HasForeignKey(e => e.RoleId)
              .OnDelete(DeleteBehavior.Restrict);

            builder.HasMany(c => c.UserRoles)
             .WithOne(e => e.Role)
             .HasForeignKey(e => e.RoleId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasData(
                Role.Create((int)RoleType.SuperAdmin, RoleType.SuperAdmin.GetDisplayName(), RoleType.SuperAdmin.GetDisplayDescription()));

            builder.HasData(
                Role.Create((int)RoleType.OwnerAdmin, RoleType.OwnerAdmin.GetDisplayName(), RoleType.OwnerAdmin.GetDisplayDescription()));

            builder.HasData(
                Role.Create((int)RoleType.StoreUser, RoleType.StoreUser.GetDisplayName(), RoleType.StoreUser.GetDisplayDescription()));

            builder.HasData(
                Role.Create((int)RoleType.ReSeller, RoleType.ReSeller.GetDisplayName(), RoleType.ReSeller.GetDisplayDescription()));
        }
    }
}
