using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.StoreUsers;
using Domain.Entities.Owners;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StoreUserEntityTypeConfiguration : IEntityTypeConfiguration<StoreUser>
    {
        private readonly ApplicationDbContext _context;
        public StoreUserEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StoreUser> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.UserId);
            builder.HasIndex(x => x.StoreId);

            builder.HasOne(c => c.User)
             .WithOne(e => e.StoreUser)
             .HasForeignKey<StoreUser>(a => a.UserId)
             .OnDelete(DeleteBehavior.Restrict);

            builder.HasKey(x => new { x.UserId, x.StoreId });

        }
    }
}
