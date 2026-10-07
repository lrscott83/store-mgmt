using Domain.Entities.DeliveryDrivers;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Repartidores de una tienda (D5). Sin índice único: una tienda puede tener varias filas y
    /// `IsActive` decide cuáles salen en las listas (baja lógica, no borrado).
    /// </summary>
    internal sealed class DeliveryDriverEntityTypeConfiguration : IEntityTypeConfiguration<DeliveryDriver>
    {
        private readonly ApplicationDbContext _context;
        public DeliveryDriverEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<DeliveryDriver> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
            builder.Property(x => x.Phone).HasMaxLength(32).IsRequired();

            builder.HasOne(d => d.Store)
                .WithMany()
                .HasForeignKey(d => d.StoreId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}