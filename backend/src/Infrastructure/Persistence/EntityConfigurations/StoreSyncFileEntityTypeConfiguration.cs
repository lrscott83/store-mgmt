using Domain.Common.Limits;
using Domain.Entities.StoreSyncFiles;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    /// <summary>
    /// Configuración EF de los ficheros de sincronización del POS (S1, S3, S13).
    ///
    /// No hay <c>ToTable</c>: el nombre de la tabla es el de la propiedad del <c>DbSet</c>
    /// (<c>StoreSyncFile</c>). El filtro global por tenant es el que da gratis el ámbito de
    /// Owner/ReSeller —ven todas las tiendas de su tenant— y el que impide que un StoreUser vea
    /// filas de otra instalación; el ámbito POR TIENDA lo aplica el handler de cada consulta.
    /// </summary>
    internal sealed class StoreSyncFileEntityTypeConfiguration : IEntityTypeConfiguration<StoreSyncFile>
    {
        private readonly ApplicationDbContext _context;

        public StoreSyncFileEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StoreSyncFile> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.FileName)
                .HasMaxLength(StoreSyncFileLimits.FileNameMaxLength)
                .IsRequired();

            builder.Property(x => x.ContentType)
                .HasMaxLength(StoreSyncFileLimits.ContentTypeMaxLength)
                .IsRequired();

            builder.Property(x => x.StorageKey)
                .HasMaxLength(StoreSyncFileLimits.StorageKeyMaxLength)
                .IsRequired();

            builder.Property(x => x.UploadedByFullName)
                .HasMaxLength(StoreSyncFileLimits.FullNameMaxLength)
                .IsRequired();

            builder.Property(x => x.StoreName)
                .HasMaxLength(StoreSyncFileLimits.StoreNameMaxLength)
                .IsRequired();

            // El contador nace en 0 y solo lo mueve un UPDATE atómico (ver el repositorio).
            builder.Property(x => x.DownloadCount).HasDefaultValue(0);

            builder.HasIndex(x => x.StoreId);
            builder.HasIndex(x => x.TenantId);
            // La lista ordena por fecha descendente (S3): el índice evita ordenar la tabla entera.
            builder.HasIndex(x => x.CreatedDate);

            builder.HasOne(x => x.Store)
                .WithMany()
                .HasForeignKey(x => x.StoreId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
