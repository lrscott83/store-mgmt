using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.StoreSyncFiles;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreSync.Queries.DownloadStoreSyncFile
{
    /// <summary>
    /// Descarga UN fichero del repositorio (S4, S7) y registra el hecho.
    ///
    /// Dos efectos, en UNA transacción: la marca del usuario —una sola por (fichero, usuario)— y el
    /// contador del fichero, que sube en CADA descarga. La marca es informativa: si el usuario ya
    /// lo descargó, se vuelve a servir igual y el contador vuelve a subir; no hay ningún "ya lo
    /// tienes" que bloquee.
    ///
    /// El fichero de OTRA tienda responde igual que uno inexistente —404— para no revelar qué ids
    /// existen (S5/S6).
    /// </summary>
    public sealed record DownloadStoreSyncFileQuery(Guid Id) : IQuery<StoreSyncFileContent>;

    /// <summary>
    /// El contenido listo para servir por HTTP. Lleva el stream ABIERTO: lo cierra la respuesta,
    /// no el handler. El nombre y el content type salen de la fila, no del disco.
    /// </summary>
    public sealed record StoreSyncFileContent(Stream Content, string FileName, string ContentType, long Length);

    public class DownloadStoreSyncFileQueryHandler
        : IQueryHandler<DownloadStoreSyncFileQuery, StoreSyncFileContent>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreSyncFileRepository _fileRepository;
        private readonly IStoreSyncFileStorage _storage;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public DownloadStoreSyncFileQueryHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreSyncFileRepository fileRepository,
            IStoreSyncFileStorage storage,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _fileRepository = fileRepository;
            _storage = storage;
            _storeRepository = storeRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreSyncFileContent>> Handle(
            DownloadStoreSyncFileQuery query, CancellationToken cancellationToken)
        {
            StoreSyncFile? file = await _fileRepository.GetActiveByIdAsync(query.Id, cancellationToken);
            if (file is null)
                throw StoreSyncStoreScope.FileNotFound(_localizer);

            // El ámbito se valida sobre la TIENDA del fichero, no sobre la tienda seleccionada del
            // POS: descargar importa contra la tienda del archivo (S7).
            if (await StoreSyncStoreScope.TryResolveAsync(
                    file.StoreId, _httpContextService, _storeRepository, cancellationToken) is null)
                throw StoreSyncStoreScope.FileNotFound(_localizer);

            // Defensa en profundidad: la clave persistida tiene que decir la MISMA tienda que la
            // fila. Una fila corrupta no puede convertirse en una lectura de otra carpeta.
            if (!_storage.BelongsToStore(file.StorageKey, file.TenantId, file.StoreId))
                throw StoreSyncStoreScope.FileNotFound(_localizer);

            Guid userId = _httpContextService.UserExternalId.ToGuid();
            if (userId == Guid.Empty)
                throw StoreSyncStoreScope.FileNotFound(_localizer);

            Stream? content = await _storage.OpenAsync(file.StorageKey, cancellationToken);
            if (content is null)
            {
                // La fila existe pero el blob no: para el cliente es un fichero que no está. Se
                // responde 404 en vez de un 500 porque no hay nada que reintentar.
                throw StoreSyncStoreScope.FileNotFound(_localizer);
            }

            bool handedOff = false;
            try
            {
                await using var transaction = await _applicationUnitOfWork.BeginTransactionAsync(cancellationToken);

                // Idempotente: la base ignora la marca si ya existía (R3-2). Ya no se lee antes de
                // escribir, así que dos descargas simultáneas del mismo usuario no se pisan.
                await _fileRepository.MarkDownloadAsync(
                    StoreSyncFileDownload.Create(file.Id, userId, file.TenantId, DateTimeOffset.UtcNow),
                    cancellationToken);

                // El contador sube SIEMPRE, marcado o no: cuenta descargas, no usuarios.
                await _fileRepository.IncrementDownloadCountAsync(file.Id, userId, cancellationToken);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                handedOff = true;
                return ResponseResult.Success(new StoreSyncFileContent(
                    content, file.FileName, file.ContentType, file.SizeBytes));
            }
            finally
            {
                // Si la petición falla antes de entregar el stream a la respuesta, se cierra aquí o
                // el descriptor de archivo se queda abierto hasta que pase el GC.
                if (!handedOff)
                    await content.DisposeAsync();
            }
        }
    }
}
