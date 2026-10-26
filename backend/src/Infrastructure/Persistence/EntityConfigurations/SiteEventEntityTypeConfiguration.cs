using Domain.Entities.SiteTelemetry;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Eventos anónimos del sitio público. Append-only: sin borrado lógico, sin auditoría y SIN
    /// filtro global por tenant — la tabla no pertenece a ninguna tienda (a diferencia de
    /// `CatalogEvent`, que sí es multi-tenant).
    /// </summary>
    internal sealed class SiteEventEntityTypeConfiguration : IEntityTypeConfiguration<SiteEvent>
    {
        public void Configure(EntityTypeBuilder<SiteEvent> builder)
        {
            builder.HasKey(x => x.Id);

            // Lecturas futuras (panel): rango por fecha y rango por tipo de evento.
            builder.HasIndex(x => x.OccurredAt);
            builder.HasIndex(x => new { x.Kind, x.OccurredAt });
            builder.HasIndex(x => new { x.Path, x.OccurredAt });

            builder.Property(x => x.Path).HasMaxLength(SiteEvent.PathMaxLength).IsRequired();
            builder.Property(x => x.VisitorHash).HasMaxLength(SiteEvent.HashMaxLength).IsRequired();
            builder.Property(x => x.SessionHash).HasMaxLength(SiteEvent.HashMaxLength).IsRequired();
            builder.Property(x => x.ReferrerHost).HasMaxLength(SiteEvent.ReferrerHostMaxLength);
            builder.Property(x => x.UtmSource).HasMaxLength(SiteEvent.UtmMaxLength);
            builder.Property(x => x.UtmMedium).HasMaxLength(SiteEvent.UtmMaxLength);
            builder.Property(x => x.UtmCampaign).HasMaxLength(SiteEvent.UtmMaxLength);
        }
    }
}
