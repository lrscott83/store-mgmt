using Domain.Entities.SalesManagers;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Perfil de gestor de ventas (Owner-level). Un `User` tiene como máximo un perfil
    /// (índice único en `UserId`); el Owner puede tener muchos.
    /// </summary>
    internal sealed class SalesManagerEntityTypeConfiguration : IEntityTypeConfiguration<SalesManager>
    {
        private readonly ApplicationDbContext _context;

        public SalesManagerEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<SalesManager> builder)
        {
            builder.ToTable("SalesManager");
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);

            builder.HasKey(x => x.Id);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.OwnerId);
            builder.HasIndex(x => x.UserId).IsUnique();

            builder.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.HasOne(x => x.Owner)
                .WithMany()
                .HasForeignKey(x => x.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
