using Domain.Entities.CatalogEvents;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Eventos anónimos del catálogo público. Append-only: no hay borrado lógico ni auditoría.
    ///
    /// El filtro global por tenant es el mismo del resto de tablas por tienda; el endpoint público
    /// escribe con el `TenantId` de la tienda resuelta por el slug, y el endpoint de estadísticas
    /// es SuperAdmin (el filtro lo deja pasar).
    /// </summary>
    internal sealed class CatalogEventEntityTypeConfiguration : IEntityTypeConfiguration<CatalogEvent>
    {
        private readonly ApplicationDbContext _context;

        public CatalogEventEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<CatalogEvent> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);

            // Las tres lecturas de las estadísticas: rango por tienda, tipo por rango, sesión por
            // tienda y producto por rango. El índice compuesto evita recorrer la tabla entera.
            builder.HasIndex(x => new { x.StoreId, x.OccurredAt });
            builder.HasIndex(x => new { x.StoreId, x.Type, x.OccurredAt });
            builder.HasIndex(x => new { x.StoreId, x.SessionHash });
            builder.HasIndex(x => new { x.StoreId, x.ProductId, x.OccurredAt });

            builder.HasKey(x => x.Id);

            builder.Property(x => x.VisitorHash).HasMaxLength(CatalogEvent.HashMaxLength).IsRequired();
            builder.Property(x => x.SessionHash).HasMaxLength(CatalogEvent.HashMaxLength).IsRequired();
            builder.Property(x => x.Path).HasMaxLength(CatalogEvent.PathMaxLength).IsRequired();
            builder.Property(x => x.ReferrerHost).HasMaxLength(CatalogEvent.ReferrerHostMaxLength);
            builder.Property(x => x.UtmSource).HasMaxLength(CatalogEvent.UtmMaxLength);
            builder.Property(x => x.UtmMedium).HasMaxLength(CatalogEvent.UtmMaxLength);
            builder.Property(x => x.UtmCampaign).HasMaxLength(CatalogEvent.UtmMaxLength);

            builder.HasOne(x => x.Store)
                .WithMany()
                .HasForeignKey(x => x.StoreId)
                // La telemetría es dato derivado: si la tienda se borra, sus eventos se van con
                // ella. `Restrict` bloquearía el borrado de la tienda por una fila de estadística.
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
