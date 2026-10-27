using Domain.Entities.StoreSyncFiles;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Configuración EF de las marcas de descarga (S4).
    ///
    /// El índice ÚNICO (fichero, usuario) es la regla de negocio en la base: "descargado" es una
    /// marca por usuario, no un histórico. Repetir la descarga NO añade otra marca —solo sube el
    /// contador del fichero— y el índice lo garantiza incluso si dos peticiones del mismo usuario
    /// llegan a la vez.
    /// </summary>
    internal sealed class StoreSyncFileDownloadEntityTypeConfiguration
        : IEntityTypeConfiguration<StoreSyncFileDownload>
    {
        private readonly ApplicationDbContext _context;

        public StoreSyncFileDownloadEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StoreSyncFileDownload> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);

            builder.HasKey(x => x.Id);

            builder.HasIndex(x => new { x.StoreSyncFileId, x.UserId }).IsUnique();
            builder.HasIndex(x => x.UserId);
            builder.HasIndex(x => x.TenantId);

            // La relación se declara AQUÍ, en el lado dependiente, y no también en la configuración
            // del fichero: es la misma relación y declararla dos veces solo abre la puerta a que las
            // dos versiones se contradigan (p. ej. una cascada y otra Restrict).
            builder.HasOne(x => x.StoreSyncFile)
                .WithMany(file => file.Downloads)
                .HasForeignKey(x => x.StoreSyncFileId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
