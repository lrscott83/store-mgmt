using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Branding;
using Application.Features.WebCatalog.Images;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Branding.Commands.UpdateStoreCatalogBranding
{
    /// <summary>
    /// Sube, cambia o quita el logo y el banner de la tienda (F8, vista Catálogo Web).
    ///
    /// El archivo llega como stream para que la capa Application no dependa de ASP.NET, igual que
    /// las imágenes de producto (`AddProductImageCommand`).
    ///
    /// Es un PUT PARCIAL, y esa es la decisión que gobierna todo el handler: cada lado trae su
    /// archivo y su bandera de borrado, y "no menciono este lado" significa "NO LO TOQUES". La
    /// alternativa —un PUT que reemplaza toda la marca— obligaría a la vista a reenviar el banner
    /// entero en cada cambio de logo, y un fallo en ese reenvío perdería una imagen que el dueño ya
    /// tenía subida.
    ///
    /// NO lleva `StoreId`: la tienda es la del contexto. Aceptarlo en el cuerpo dejaría que un
    /// dueño escribiera la marca de la tienda de otro.
    ///
    /// NO lleva `PaletteId`: las paletas se cancelaron (decisión del Owner, 2026-10-07). Esta feature
    /// escribe únicamente `LogoKey` y `BannerKey`.
    ///
    /// Dos órdenes gobiernan el handler, y los dos nacieron desendos (F8-R1 y F8-R2, revisión nativa
    /// 2026-10-07):
    ///
    ///   1. Se VALIDA antes de ESCRIBIR. Los dos archivos del PUT se validan arriba del todo, antes de
    ///      que ninguno toque el disco. Validar cada lado justo antes de guardarlo dejaba el logo ya
    ///      escrito cuando el banner resultaba inválido, y ese archivo se quedaba para siempre.
    ///   2. Se PERSISTE antes de BORRAR. Los archivos que quedan obsoletos se encolan y se borran solo
    ///      cuando la fila ya está guardada; si el guardado falla, se borra lo nuevo (compensación) y
    ///      lo anterior sobrevive. Al revés, un fallo de `SaveChanges` dejaba la fila apuntando a un
    ///      archivo ya borrado, y el catálogo público respondía 404 por la marca que acababa de subir.
    /// </summary>
    public sealed record UpdateStoreCatalogBrandingCommand(
        CatalogImageUpload? Logo,
        bool RemoveLogo,
        CatalogImageUpload? Banner,
        bool RemoveBanner) : ICommand<StoreCatalogBrandingDto>;

    public class UpdateStoreCatalogBrandingCommandHandler
        : ICommandHandler<UpdateStoreCatalogBrandingCommand, StoreCatalogBrandingDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<UpdateStoreCatalogBrandingCommandHandler> _logger;

        public UpdateStoreCatalogBrandingCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer,
            ILogger<UpdateStoreCatalogBrandingCommandHandler> logger)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
            _logger = logger;
        }

        public async Task<ResponseResult<StoreCatalogBrandingDto>> Handle(
            UpdateStoreCatalogBrandingCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            Guid tenantId = _httpContextService.TenantId.ToGuid();

            // Alta o actualización por `StoreId` (D7: una fila por tienda, índice único).
            // Reutilizar la fila cargada conserva SU `Id` y —esto es lo importante— SUS columnas de
            // pedidos: un id nuevo convertiría el guardado en un INSERT que chocaría con ese índice,
            // y una entidad nueva las traería en blanco.
            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetByStoreIdAsync(storeId);
            settings ??= StoreCatalogSettings.Create(storeId, tenantId);

            // F8-R1: los DOS archivos se validan ANTES de que ninguno toque el disco. Validar cada
            // lado justo antes de guardarlo dejaba el logo ya escrito cuando el banner era inválido, y
            // ese logo se quedaba en el disco como archivo huérfano por cada intento fallido.
            //
            // Las MISMAS reglas que las imágenes de producto (jpg/jpeg/png/webp y 2 MB), con el mismo
            // 400 localizado. La marca no es una puerta distinta al contenido del catálogo.
            if (request.Logo != null)
                CatalogImageUploadRules.EnsureValid(
                    request.Logo.FileName, request.Logo.ContentType, request.Logo.Length, _localizer);

            if (request.Banner != null)
                CatalogImageUploadRules.EnsureValid(
                    request.Banner.FileName, request.Banner.ContentType, request.Banner.Length, _localizer);

            // F8-R2: los archivos que la fila va a dejar atrás se COLECCIONAN y se borran después de
            // persistir, nunca antes. Borrarlos aquí dejaría la fila apuntando a un archivo que ya no
            // existe si el guardado fallara — el catálogo público pediría un 404 por la marca que el
            // dueño acababa de subir.
            var obsoleteKeys = new List<string>();
            var newKeys = new List<string>();

            // Los dos lados se resuelven antes de tocar la fila. Nada de ellos puede fallar por
            // validación (eso ya está hecho arriba), así que si se llega aquí la marca se aplica
            // entera: el dueño nunca se encuentra con medio formulario guardado.
            string? logoKey = await ResolveAsync(
                request.Logo, request.RemoveLogo, settings.LogoKey, BrandingImageKinds.Logo, tenantId, storeId, obsoleteKeys, newKeys, cancellationToken);
            string? bannerKey = await ResolveAsync(
                request.Banner, request.RemoveBanner, settings.BannerKey, BrandingImageKinds.Banner, tenantId, storeId, obsoleteKeys, newKeys, cancellationToken);

            // SOLO columnas de marca (D19). Las de pedidos, `PaletteId`, `SyncedAt` e `Id` quedan
            // como estaban: si esta feature los tocara, subir un logo dejaría al dueño sin los
            // pedidos que tenía abiertos. Su ausencia aquí ES el comportamiento, no un olvido.
            settings.LogoKey = logoKey;
            settings.BannerKey = bannerKey;

            try
            {
                // El upsert del repositorio marca la entidad explícitamente (Add o Modified).
                // `ApplicationDbContext` es NoTracking, así que mutar la fila cargada y llamar a
                // `SaveChanges` sin marcar no escribiría NADA — sin error y sin aviso.
                await _storeCatalogSettingsRepository.UpsertAsync(settings);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            }
            catch
            {
                // Compensación: los archivos nuevos ya están en disco pero la fila no se persistió; sin
                // esto quedarían huérfanos. La fila anterior (y sus archivos) siguen intactos, así que
                // el catálogo sigue sirviendo la marca de antes.
                //
                // El borrado va protegido para que un fallo de disco NO enmascare la excepción que hay
                // que relanzar: el dueño necesita ver el error real, no el del almacenamiento.
                foreach (string key in newKeys)
                {
                    try
                    {
                        await _catalogImageStorage.DeleteAsync(key, cancellationToken);
                    }
                    catch (Exception exception)
                    {
                        _logger.LogWarning(
                            exception,
                            "Fallo al guardar la marca de la tienda {StoreId}: no se pudo borrar el archivo recién subido '{Key}', que queda como deuda de disco.",
                            storeId,
                            key);
                    }
                }

                throw;
            }

            // La fila está guardada, así que los archivos obsoletos son DEUDA DE DISCO y no parte de la
            // operación. Un fallo aquí no se relanza: devolver un error por un borrado que ya no
            // cambia nada haría que el reintento del dueño viera un 404 por una imagen que ya no se
            // usa. Se registra para que la deuda sea rastreable y se limpia aparte.
            foreach (string key in obsoleteKeys)
            {
                try
                {
                    await _catalogImageStorage.DeleteAsync(key, cancellationToken);
                }
                catch (Exception exception)
                {
                    _logger.LogWarning(
                        exception,
                        "Marca de la tienda {StoreId} guardada, pero no se pudo borrar el archivo obsoleto '{Key}': la fila ya no lo apunta.",
                        storeId,
                        key);
                }
            }

            return ResponseResult.Success(new StoreCatalogBrandingDto
            {
                LogoKey = settings.LogoKey,
                BannerKey = settings.BannerKey,
                PaletteId = string.IsNullOrWhiteSpace(settings.PaletteId)
                    ? StoreCatalogSettings.DefaultPaletteId
                    : settings.PaletteId,
            });
        }

        /// <summary>
        /// Resuelve UN lado de la marca y devuelve la key con la que queda. NO borra nada.
        ///
        ///   * Sin archivo y sin quitar → se devuelve la anterior sin tocar nada (el PUT parcial).
        ///   * Quitar → se apunta la anterior como obsoleta y la key queda en null.
        ///   * Subir → se guarda la nueva, se apunta como nueva y la anterior como obsoleta.
        ///
        /// El borrado NO ocurre aquí, y esa es la garantía: lo que deja de usarse se encola en
        /// <paramref name="obsoleteKeys"/> y lo recién escrito en <paramref name="newKeys"/>, y el
        /// handler decide el momento. El orden es guardar → persistir → y SOLO entonces borrar:
        ///
        ///   * Si el guardado falla, el handler borra lo nuevo y lo anterior sobrevive: la fila sigue
        ///     apuntando a un archivo que existe y no queda ningún huérfano.
        ///   * Si el borrado falla, la fila ya no apunta a ese archivo, así que el catálogo sigue
        ///     sirviendo la nueva con normalidad y el archivo viejo es deuda de disco.
        /// </summary>
        private async Task<string?> ResolveAsync(
            CatalogImageUpload? upload,
            bool remove,
            string? previousKey,
            string kind,
            Guid tenantId,
            Guid storeId,
            ICollection<string> obsoleteKeys,
            ICollection<string> newKeys,
            CancellationToken cancellationToken)
        {
            if (upload == null && !remove)
                return previousKey;

            if (remove)
            {
                // Quitar algo que no estaba no encola nada: no hay archivo, y no es un error.
                if (!string.IsNullOrWhiteSpace(previousKey))
                    obsoleteKeys.Add(previousKey);

                return null;
            }

            // Sin `CatalogImageUploadRules.EnsureValid` aquí a propósito: la validación es up-front en
            // `Handle`, para que un lado inválido rechace la petición ANTES de que el otro se escriba.
            // Volver a validar aquí solo añadiría una comprobación que llega tarde.
            string key = await _catalogImageStorage.SaveBrandingAsync(upload!, tenantId, storeId, kind, cancellationToken);
            newKeys.Add(key);

            // Sin esta guarda, subir un logo donde ya había uno dejaría en el disco un archivo que ya
            // nadie va a pedir.
            if (!string.IsNullOrWhiteSpace(previousKey)
                && !string.Equals(previousKey, key, StringComparison.Ordinal))
            {
                obsoleteKeys.Add(previousKey);
            }

            return key;
        }
    }
}