using Domain.Entities.StoreSyncFiles;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    /// <summary>
    /// Repositorio del repositorio de ficheros de sincronización del POS.
    ///
    /// Ninguna consulta lleva <c>AsNoTracking()</c>: el <c>ApplicationDbContext</c> fija
    /// <c>QueryTrackingBehavior.NoTracking</c> para TODO el contexto, así que repetirlo aquí no
    /// cambiaría nada y escondería el motivo por el que una entidad leída no se actualiza sola.
    /// </summary>
    public class StoreSyncFileRepository : GenericRepository<StoreSyncFile, Guid>, IStoreSyncFileRepository
    {
        private readonly DbSet<StoreSyncFile> _files;
        private readonly DbSet<StoreSyncFileDownload> _downloads;

        public StoreSyncFileRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _files = dbContext.Set<StoreSyncFile>();
            _downloads = dbContext.Set<StoreSyncFileDownload>();
        }

        public async Task<IReadOnlyList<StoreSyncFile>> GetActiveOrderedByDateAsync(Guid? storeId,
            CancellationToken cancellationToken = default)
        {
            // Las filas dadas de baja no se listan: el borrado es lógico (conserva el historial),
            // pero el repositorio solo muestra lo que existe (S8).
            IQueryable<StoreSyncFile> query = _files.Where(file => file.IsActive);

            if (storeId.HasValue)
                query = query.Where(file => file.StoreId == storeId.Value);

            return await query
                .OrderByDescending(file => file.CreatedDate)
                .ToListAsync(cancellationToken);
        }

        public async Task<StoreSyncFile?> GetActiveByIdAsync(Guid id, CancellationToken cancellationToken = default)
            => await _files.FirstOrDefaultAsync(file => file.Id == id && file.IsActive, cancellationToken);

        public async Task<IReadOnlyList<StoreSyncFileDownload>> GetDownloadsByUserAsync(Guid userId,
            IReadOnlyCollection<Guid> storeSyncFileIds, CancellationToken cancellationToken = default)
        {
            // Una lista vacía no puede traducirse a IN (): se corta antes de ir a la base.
            if (storeSyncFileIds.Count == 0)
                return [];

            return await _downloads
                .Where(download => download.UserId == userId
                    && storeSyncFileIds.Contains(download.StoreSyncFileId))
                .ToListAsync(cancellationToken);
        }

        public async Task<StoreSyncFileDownload?> GetDownloadAsync(Guid storeSyncFileId, Guid userId,
            CancellationToken cancellationToken = default)
            => await _downloads.FirstOrDefaultAsync(
                download => download.StoreSyncFileId == storeSyncFileId && download.UserId == userId,
                cancellationToken);

        public async Task AddDownloadAsync(StoreSyncFileDownload download)
            => await _downloads.AddAsync(download);

        public async Task<bool> IncrementDownloadCountAsync(Guid storeSyncFileId, Guid userId,
            CancellationToken cancellationToken = default)
        {
            // UPDATE atómico, no "leer y guardar": el contador es un dato compartido y dos descargas
            // simultáneas leerían el mismo valor. ExecuteUpdate no pasa por el change tracker, así
            // que las columnas de auditoría se escriben aquí explícitamente.
            int affected = await _files
                .Where(file => file.Id == storeSyncFileId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(file => file.DownloadCount, file => file.DownloadCount + 1)
                    .SetProperty(file => file.UpdatedDate, DateTimeOffset.UtcNow)
                    .SetProperty(file => file.UpdatedBy, userId), cancellationToken);

            return affected > 0;
        }
    }
}
