using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Dtos.StoreSync;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Common.Limits;
using Domain.Entities.StoreSyncFiles;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System.Net;

namespace Application.Features.StoreSync.Commands.UploadStoreSyncFile
{
    /// <summary>
    /// Sube UN fichero de sincronización: el ZIP cifrado de UNA sola tienda (S1).
    ///
    /// `StoreId` viaja en el formulario —la única excepción autorizada a "los comandos no llevan
    /// StoreId"— porque el POS sube N archivos, uno por tienda, desde la misma sesión: la tienda
    /// del claim no sirve para decir CUÁL de ellos es. Antes de escribir nada se comprueba que esa
    /// tienda esté dentro del ámbito del llamador (S6); si no, 404 como una inexistente.
    ///
    /// Los bytes son OPAQUES (S13): se guardan tal cual y no se inspeccionan. La contraseña del ZIP
    /// nunca llega al backend y no se almacena en ningún sitio.
    /// </summary>
    public sealed record UploadStoreSyncFileCommand(
        Guid StoreId,
        Stream Content,
        string FileName,
        string ContentType,
        long Length) : ICommand<StoreSyncFileDto>;

    public class UploadStoreSyncFileCommandHandler
        : ICommandHandler<UploadStoreSyncFileCommand, StoreSyncFileDto>
    {
        /// <summary>Nombre de reserva cuando el multipart no trae nombre utilizable.</summary>
        private const string FallbackFileName = "backup.zip";

        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreSyncFileRepository _fileRepository;
        private readonly IStoreSyncFileStorage _storage;
        private readonly IStoreRepository _storeRepository;
        private readonly IUserRepository _userRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<UploadStoreSyncFileCommandHandler> _logger;

        public UploadStoreSyncFileCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreSyncFileRepository fileRepository,
            IStoreSyncFileStorage storage,
            IStoreRepository storeRepository,
            IUserRepository userRepository,
            IStringLocalizer<I18n> localizer,
            ILogger<UploadStoreSyncFileCommandHandler> logger)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _fileRepository = fileRepository;
            _storage = storage;
            _storeRepository = storeRepository;
            _userRepository = userRepository;
            _localizer = localizer;
            _logger = logger;
        }

        public async Task<ResponseResult<StoreSyncFileDto>> Handle(
            UploadStoreSyncFileCommand request, CancellationToken cancellationToken)
        {
            // El tenant se escribe en la fila: un token sin ese claim dejaría `TenantId = Guid.Empty`,
            // una fila que el filtro global resuelve a NULL —invisible para siempre— con su archivo
            // ya en disco. Se rechaza antes de tocar nada.
            Guid tenantId = _httpContextService.TenantId.ToGuid();
            if (tenantId == Guid.Empty)
                throw new ApiException(_localizer["StoreSyncFileStoreNotAllowed"], HttpStatusCode.BadRequest);

            // Se valida el TAMAÑO antes de resolver el ámbito y antes de escribir: un fichero de 0
            // bytes o de más de 50 MB no puede dejar una fila ni un blob a medias (S10).
            EnsureSizeIsAllowed(request.Length);

            Store? store = await StoreSyncStoreScope.TryResolveAsync(
                request.StoreId, _httpContextService, _storeRepository, cancellationToken);
            if (store is null)
                throw StoreSyncStoreScope.StoreNotAllowed(_localizer);

            User? uploader = await _userRepository.GetByIdAsync(_httpContextService.UserExternalId.ToGuid());
            if (uploader is null || string.IsNullOrWhiteSpace(uploader.FullName))
                throw new ApiException(_localizer["StoreSyncFileUploadFailed"], HttpStatusCode.BadRequest);

            // El id nace ANTES de la fila porque la clave del blob lo lleva: la composición de la
            // clave es del almacenamiento, y el almacenamiento necesita saber de qué fichero habla.
            Guid fileId = Guid.NewGuid();
            string key = await _storage.SaveAsync(
                new StoreSyncFileUpload(request.Content, request.FileName, request.ContentType, request.Length),
                tenantId,
                store.Id,
                fileId,
                cancellationToken);

            try
            {
                StoreSyncFile file = StoreSyncFile.Create(
                    fileId,
                    store.Id,
                    tenantId,
                    ResolveFileName(request.FileName),
                    ResolveContentType(request.ContentType),
                    request.Length,
                    key,
                    uploader.Id,
                    uploader.FullName.Trim(),
                    store.Name);

                await _fileRepository.AddAsync(file);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

                // Un fichero recién subido no puede tener marcas de descarga: `downloadedByMe` nace false.
                return ResponseResult.Success(StoreSyncFileMapper.Map(file, download: null));
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // COMPENSACIÓN archivo↔fila: el blob ya está en disco y la fila era lo único que lo
                // referenciaba. Si la persistencia falla, nadie volvería a pedir esa clave y quedaría
                // un huérfano que no se limpia solo. El error original se registra y se responde con
                // el 500 localizado del repositorio, para que el cliente no vea un texto de EF.
                _logger.LogError(exception,
                    "No se pudo persistir el fichero de sincronización {StorageKey}; se compensa borrando el blob.",
                    key);
                await TryDeleteFileQuietlyAsync(key);
                throw new ApiException(_localizer["StoreSyncFileUploadFailed"], HttpStatusCode.InternalServerError);
            }
        }

        /// <summary>
        /// 0 bytes es lo que deja el binding cuando el multipart no trae archivo: 400 (S10).
        /// Por encima de 50 MB, 413 — RequestEntityTooLarge — y no se escribe nada (S10).
        /// </summary>
        private void EnsureSizeIsAllowed(long length)
        {
            if (length <= 0)
                throw new ApiException(_localizer["StoreSyncFileEmpty"], HttpStatusCode.BadRequest);

            if (length > StoreSyncFileLimits.MaxFileSizeInBytes)
                throw new ApiException(
                    _localizer["StoreSyncFileTooLarge", StoreSyncFileLimits.MaxFileSizeInBytes / (1024 * 1024)],
                    HttpStatusCode.RequestEntityTooLarge);
        }

        /// <summary>
        /// Se queda con el NOMBRE, nunca con una ruta: el nombre viaja en la cabecera de descarga y
        /// una barra invertida o un `..` no tienen nada que hacer ahí. Vacío → nombre de reserva, y
        /// se recorta al ancho de la columna en vez de dejar que PostgreSQL reviente por longitud.
        /// </summary>
        private static string ResolveFileName(string? fileName)
        {
            string name = Path.GetFileName((fileName ?? string.Empty).Trim().Replace('\\', '/')).Trim();
            if (string.IsNullOrWhiteSpace(name))
                return FallbackFileName;

            return name.Length > StoreSyncFileLimits.FileNameMaxLength
                ? name[..StoreSyncFileLimits.FileNameMaxLength]
                : name;
        }

        private static string ResolveContentType(string? contentType)
        {
            string resolved = string.IsNullOrWhiteSpace(contentType) ? StoreSyncFileLimits.ContentType : contentType.Trim();
            return resolved.Length > StoreSyncFileLimits.ContentTypeMaxLength
                ? resolved[..StoreSyncFileLimits.ContentTypeMaxLength]
                : resolved;
        }

        /// <summary>
        /// Borra el blob de compensación sin dejar que un fallo de limpieza reemplace el error que se
        /// va a reportar. Usa <c>CancellationToken.None</c> a propósito: la limpieza no debería
        /// abandonarse porque el cliente colgó, que es justo lo que deja huérfanos.
        /// </summary>
        private async Task TryDeleteFileQuietlyAsync(string key)
        {
            try
            {
                await _storage.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception exception)
            {
                _logger.LogWarning(exception,
                    "No se pudo borrar el fichero de sincronización {StorageKey} durante la compensación; queda como deuda de disco.",
                    key);
            }
        }
    }
}
