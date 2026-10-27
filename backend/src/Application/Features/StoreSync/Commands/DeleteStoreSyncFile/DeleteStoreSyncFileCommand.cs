using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.StoreSyncFiles;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System.Net;

namespace Application.Features.StoreSync.Commands.DeleteStoreSyncFile
{
    /// <summary>
    /// Borra UN fichero del repositorio (S8). Nada se borra automáticamente: el Owner puede borrar
    /// cualquier fichero de sus tiendas y el StoreUser solo los de la suya, y esa comprobación la
    /// hace <see cref="StoreSyncStoreScope"/> antes de tocar nada.
    ///
    /// La baja es LÓGICA en la base (<c>IsActive = false</c>) y FÍSICA en el disco (el blob se
    /// borra). Es la forma de que el fichero desaparezca del repositorio sin perder el rastro de
    /// quién lo subió y cuándo — el mismo criterio que el resto de bajas del sistema.
    ///
    /// El orden importa: primero la fila y después el blob. Si falla la fila, no se ha borrado
    /// nada; si falla el borrado del blob, la operación ya está hecha y lo que queda es un archivo
    /// huérfano que se registra para poder limpiarlo, no un 500 sobre algo que el usuario ya no ve.
    /// </summary>
    public sealed record DeleteStoreSyncFileCommand(Guid Id) : ICommand<bool>;

    public class DeleteStoreSyncFileCommandHandler
        : ICommandHandler<DeleteStoreSyncFileCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreSyncFileRepository _fileRepository;
        private readonly IStoreSyncFileStorage _storage;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<DeleteStoreSyncFileCommandHandler> _logger;

        public DeleteStoreSyncFileCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreSyncFileRepository fileRepository,
            IStoreSyncFileStorage storage,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer,
            ILogger<DeleteStoreSyncFileCommandHandler> logger)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _fileRepository = fileRepository;
            _storage = storage;
            _storeRepository = storeRepository;
            _localizer = localizer;
            _logger = logger;
        }

        public async Task<ResponseResult<bool>> Handle(
            DeleteStoreSyncFileCommand request, CancellationToken cancellationToken)
        {
            StoreSyncFile? file = await _fileRepository.GetActiveByIdAsync(request.Id, cancellationToken);
            if (file is null)
                throw StoreSyncStoreScope.FileNotFound(_localizer);

            if (await StoreSyncStoreScope.TryResolveAsync(
                    file.StoreId, _httpContextService, _storeRepository, cancellationToken) is null)
                throw StoreSyncStoreScope.FileNotFound(_localizer);

            try
            {
                // `IsActive = false` AQUÍ y no dentro de `SoftDeleteAsync`: el helper genérico solo
                // voltea el flag cuando la entidad deriva del `AuditableEntity` no genérico, y
                // `StoreSyncFile` deriva de `AuditableEntity<Guid>` — otra jerarquía. Sin esta línea
                // el helper adjunta la entidad pero reescribe `IsActive = true`, el UPDATE no da de
                // baja nada y el fichero sigue en la lista (lo cazó
                // StoreSyncFilesTests.Owner_round_trip_lists_downloads_twice_and_deletes).
                //
                // `SoftDeleteAsync` sigue siendo quien adjunta la entidad como Modified: el
                // contexto es NoTracking y sin ese paso `SaveChangesAsync` no escribiría nada.
                file.IsActive = false;
                await _fileRepository.SoftDeleteAsync(file);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // La fila NO se dio de baja: el blob se conserva, porque sigue siendo el contenido
                // de un fichero que el repositorio todavía muestra.
                _logger.LogError(exception,
                    "No se pudo dar de baja el fichero de sincronización {StoreSyncFileId}.", request.Id);
                throw new ApiException(_localizer["StoreSyncFileDeleteFailed"], HttpStatusCode.InternalServerError);
            }

            try
            {
                await _storage.DeleteAsync(file.StorageKey, cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // La fila ya está dada de baja: el usuario no vuelve a ver el fichero. Lo que queda
                // es un blob huérfano, que se registra como deuda de disco en vez de convertir un
                // borrado ya consumado en un error.
                _logger.LogWarning(exception,
                    "El fichero {StorageKey} quedó en disco tras dar de baja la fila {StoreSyncFileId}; deuda de disco.",
                    file.StorageKey, file.Id);
            }

            return ResponseResult.Success(true);
        }
    }
}
