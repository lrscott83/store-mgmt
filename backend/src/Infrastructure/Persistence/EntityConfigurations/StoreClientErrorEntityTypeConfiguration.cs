using Domain.Entities.StoreClientErrors;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Configuración EF de los errores del cliente POS (`pos-client-error-logs`, spec S5).
    ///
    /// Sin filtro global por tenant: la consulta la hace el SuperAdmin y la vista lista errores de
    /// varias tiendas a la vez, así que un filtro por tenant escondería justo las filas que la
    /// pantalla debe mostrar. El aislamiento lo da el gate `[HasPermission(SuperAdmin)]` del
    /// endpoint, no la base.
    ///
    /// El FK es <c>Cascade</c> para que el `ResetDataAsync` de los E2E siga borrando tiendas sin
    /// tener que conocer esta tabla.
    /// </summary>
    internal sealed class StoreClientErrorEntityTypeConfiguration : IEntityTypeConfiguration<StoreClientError>
    {
        public void Configure(EntityTypeBuilder<StoreClientError> builder)
        {
            builder.HasKey(x => x.Id);

            // Lecturas del panel: rango por fecha global y rango por fecha dentro de una tienda.
            builder.HasIndex(x => x.OccurredAt);
            builder.HasIndex(x => new { x.StoreId, x.OccurredAt });

            builder.Property(x => x.Message)
                .HasMaxLength(StoreClientError.MessageMaxLength)
                .IsRequired();

            builder.Property(x => x.Route).HasMaxLength(StoreClientError.RouteMaxLength);
            builder.Property(x => x.Location).HasMaxLength(StoreClientError.LocationMaxLength);
            builder.Property(x => x.Context).HasMaxLength(StoreClientError.ContextMaxLength);
            builder.Property(x => x.AppVersion).HasMaxLength(StoreClientError.AppVersionMaxLength);
            builder.Property(x => x.Device).HasMaxLength(StoreClientError.DeviceMaxLength);

            // Una fila nunca representa cero ocurrencias: el default de la columna es 1.
            builder.Property(x => x.Count).HasDefaultValue(1).IsRequired();

            // StoreId nullable (spec S4) + Cascade (spec S5, requisito del ResetDataAsync de los E2E).
            builder.HasOne(x => x.Store)
                .WithMany()
                .HasForeignKey(x => x.StoreId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
