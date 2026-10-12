using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Images;
using Application.Features.WebCatalog.Showcase;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.StoreCatalogImages;
using Domain.Interfaces.Repositories;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Showcase.Commands.AddStoreCatalogImage
{
    /// <summary>
    /// Sube una imagen a UN conjunto del showcase (carrusel o imágenes del día) y devuelve la fila
    /// creada. El archivo llega como stream para que la capa Application no dependa de ASP.NET,
    /// igual que las imágenes de producto y que la marca (F8).
    ///
    /// NO lleva `StoreId`: la tienda es la del contexto. Aceptarlo en el cuerpo dejaría que un dueño
    /// escribiera el showcase de la tienda de otro.
    ///
    /// NO lleva `OrderIndex`: entrar al final del conjunto es lo único que un dueño espera al subir,
    /// y el reordenado es un comando aparte. El hueco que deja un borrado no se rellena, porque
    /// rellenarlo exigiría compactar el resto y esa operación no existe en esta feature.
    ///
    /// El `Kind` sí viaja, y tiene que ser un valor del enum: un conjunto inventado escribiría una
    /// fila que el catálogo público nunca publica y que la vista no puede quitar.
    /// </summary>
    public sealed record AddStoreCatalogImageCommand(
        StoreCatalogImageKind Kind,
        Stream Content,
        string FileName,
        string ContentType,
        long Length,
        string? Caption) : ICommand<StoreCatalogImageDto>;

    public class AddStoreCatalogImageCommandHandler
        : ICommandHandler<AddStoreCatalogImageCommand, StoreCatalogImageDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogImageRepository _imageRepository;
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<AddStoreCatalogImageCommandHandler> _logger;

        public AddStoreCatalogImageCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreCatalogImageRepository imageRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer,
            ILogger<AddStoreCatalogImageCommandHandler> logger)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _imageRepository = imageRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
            _logger = logger;
        }

        public async Task<ResponseResult<StoreCatalogImageDto>> Handle(
            AddStoreCatalogImageCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // El tenant se escribe en la fila, así que también tiene que existir: un token sin claim de
            // tenant dejaría `TenantId = Guid.Empty`, una fila que el filtro global resuelve a NULL y
            // que por tanto nadie vería ni podría quitar — invisible para siempre, con su archivo en
            // disco. Mismo guard que la tienda, antes de subir nada.
            Guid tenantId = _httpContextService.TenantId.ToGuid();
            if (tenantId == Guid.Empty)
                throw new ApiException(_localizer["ShowcaseStoreTenantNotResolved"], HttpStatusCode.BadRequest);

            // Un conjunto que no existe en el enum no se valida solo: el validador lo rechaza, pero el
            // handler no confía en eso porque el comando también se puede enviar por otra vía. Escribir
            // una fila de un conjunto que nadie publica sería un dato muerto e imposible de quitar.
            if (!Enum.IsDefined(request.Kind))
                throw new ApiException(
                    _localizer["ShowcaseImageKindInvalid", request.Kind],
                    HttpStatusCode.BadRequest);

            // Tope POR CONJUNTO (decisión C1): los dos conjuntos son independientes, así que un tope
            // compartido dejaría a una tienda con el carrusel lleno sin poder destacar nada.
            //
            // Esta lectura es solo un rechazo TEMPRANO, para no subir un archivo que se va a descartar.
            // La comprobación AUTORITATIVA se repite dentro del lock de abajo: entre esta lectura y la
            // inserción cabe otra petición concurrente.
            IList<StoreCatalogImage> existing = (await _imageRepository.GetByStoreIdAsync(storeId))
                .Where(image => image.Kind == request.Kind)
                .ToList();

            if (existing.Count >= StoreCatalogImage.MaxImagesPerKind)
                throw new ApiException(
                    _localizer["ShowcaseImagesLimitReached", request.Kind, StoreCatalogImage.MaxImagesPerKind],
                    HttpStatusCode.BadRequest);

            // Valida ANTES de subir: un archivo inválido no puede dejar un archivo huérfano en disco.
            // Las MISMAS reglas que las imágenes de producto (jpg/jpeg/png/webp y 2 MB), con el mismo
            // 400 localizado. El showcase no es una puerta distinta al contenido del catálogo.
            CatalogImageUploadRules.EnsureValid(request.FileName, request.ContentType, request.Length, _localizer);

            string key = await _catalogImageStorage.SaveCatalogImageAsync(
                new CatalogImageUpload(request.Content, request.FileName, request.ContentType, request.Length),
                tenantId,
                storeId,
                FolderOf(request.Kind),
                cancellationToken);

            StoreCatalogImage image;
            try
            {
                // Transacción EXPLÍCITA + lock por (tienda, conjunto): la comprobación y la inserción
                // dejan de ser un check-then-act. Dos subidas concurrentes al mismo conjunto se
                // serializan aquí, así que la segunda cuenta la fila de la primera y respeta el tope;
                // tiendas o conjuntos distintos no se bloquean entre sí.
                await using IDbContextTransaction transaction = await _applicationUnitOfWork.BeginTransactionAsync(cancellationToken);
                await _imageRepository.AcquireSetLockAsync(storeId, request.Kind, cancellationToken);

                IList<StoreCatalogImage> current = (await _imageRepository.GetByStoreIdAsync(storeId))
                    .Where(stored => stored.Kind == request.Kind)
                    .ToList();

                if (current.Count >= StoreCatalogImage.MaxImagesPerKind)
                    throw new ApiException(
                        _localizer["ShowcaseImagesLimitReached", request.Kind, StoreCatalogImage.MaxImagesPerKind],
                        HttpStatusCode.BadRequest);

                // Al final del conjunto: `Max` y no `Count`, para que un hueco de un borrado anterior no
                // haga que dos imágenes entren en la misma posición. Se calcula DENTRO del lock, sobre
                // la lectura ya serializada.
                int orderIndex = current.Count == 0 ? 0 : current.Max(stored => stored.OrderIndex) + 1;

                image = StoreCatalogImage.Create(storeId, tenantId, request.Kind, key, orderIndex, request.Caption);

                await _imageRepository.AddAsync(image);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            catch
            {
                // COMPENSACIÓN del archivo↔fila: el archivo YA está escrito en disco y la fila era lo
                // único que lo referenciaba. Si la persistencia falla —o el lock descubre que el
                // conjunto se llenó—, nadie volvería a pedir esa clave y quedaría un huérfano que no
                // se limpia solo. El error original se relanza tal cual: lo que se reporta es el fallo
                // de la operación, no el de la limpieza.
                await TryDeleteFileQuietlyAsync(key);
                throw;
            }

            return ResponseResult.Success(new StoreCatalogImageDto
            {
                Id = image.Id,
                Kind = image.Kind,
                Key = image.Key,
                OrderIndex = image.OrderIndex,
                Caption = image.Caption,
                IsActive = image.IsActive,
            });
        }

        /// <summary>
        /// Borra el archivo de compensación sin dejar que un fallo de limpieza reemplace el error que se
        /// va a reportar. Usa <c>CancellationToken.None</c> a propósito: la limpieza no debería
        /// abandonarse porque el cliente colgó, es justo lo que deja huérfanos.
        /// </summary>
        private async Task TryDeleteFileQuietlyAsync(string key)
        {
            try
            {
                await _catalogImageStorage.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception exception)
            {
                _logger.LogWarning(
                    exception,
                    "No se pudo borrar el archivo de showcase {ImageKey} durante la compensación; queda como deuda de disco.",
                    key);
            }
        }

        /// <summary>
        /// Carpeta del conjunto dentro de la clave. Vive aquí, y no como `ToString()` del enum, porque
        /// el nombre de la carpeta lo decide el llamador —igual que en la marca— y una traducción suelta
        /// cambiaría el sitio donde están los archivos ya subidos.
        /// </summary>
        private static string FolderOf(StoreCatalogImageKind kind)
            => kind == StoreCatalogImageKind.Daily ? ShowcaseImageKinds.Daily : ShowcaseImageKinds.Carousel;
    }
}
