using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Users;
using static Domain.Common.Constants.DataUtils;
using Domain.Common.Constants;
using System.Net;
using Domain.Entities.Owners;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class UserEntityTypeConfiguration : IEntityTypeConfiguration<User>
    {
        private readonly ApplicationDbContext _context;
        public UserEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<User> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin 
            || x.TenantId == _context.TenantId
            || _context.IsReSeller && x.Id == _context.CurrentUserId);
            builder.HasIndex(x => x.TenantId);

            builder.HasKey(x => x.Id);
            builder.HasIndex(x => x.Login).IsUnique();

            builder.HasMany(c => c.UserRoles)
             .WithOne(e => e.User)
             .HasForeignKey(e => e.UserId)
             .OnDelete(DeleteBehavior.Restrict);

            //builder.HasOne(c => c.Owner)
            // .WithOne(e => e.User)
            // .HasForeignKey<Owner>(a => a.UserId)
            // .OnDelete(DeleteBehavior.Restrict);

            builder.HasData(
                User.Create(SuperAdminUser.Id, "admin", "XwHSL3RwmY9AkQLdRIeWr/H1xHm7ulj/la+EYwkLgrA=", 
                "Lizardo Romero", "52432968", "lrscott83@gmail.com", DefaultTenant.Id));
        }
    }
}
