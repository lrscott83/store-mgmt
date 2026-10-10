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
    /// escribe `LogoKey`, `BannerKey` y `TemplateId` (la plantilla/vista del catálogo).
    ///
    /// `TemplateId` es PARCIAL como los lados de imagen: `null` o en blanco = "no toco la plantilla";
    /// un valor no vacío se valida y se escribe. Se estrena con valor por defecto para no obligar a
    /// las llamadas de logo/banner a mencionarlo.
    /// </summary>
    public sealed record UpdateStoreCatalogBrandingCommand(
        CatalogImageUpload? Logo,
        bool RemoveLogo,
        CatalogImageUpload? Banner,
        bool RemoveBanner,
        string? TemplateId = null) : ICommand<StoreCatalogBrandingDto>;

    public class UpdateStoreCatalogBrandingCommandHandler
        : ICommandHandler<UpdateStoreCatalogBrandingCommand, StoreCatalogBrandingDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateStoreCatalogBrandingCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
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

            // Se resuelven los DOS lados ANTES de escribir nada. Si el banner resultara inválido, el
            // logo ya subido no se persiste: el dueño recibe un 400 y su logo sigue siendo el de
            // antes, en vez de encontrarse con medio formulario aplicado.
            string? logoKey = await ResolveAsync(
                request.Logo, request.RemoveLogo, settings.LogoKey, BrandingImageKinds.Logo, tenantId, storeId, cancellationToken);
            string? bannerKey = await ResolveAsync(
                request.Banner, request.RemoveBanner, settings.BannerKey, BrandingImageKinds.Banner, tenantId, storeId, cancellationToken);

            // SOLO columnas de marca (D19): logo, banner y plantilla. Las de pedidos, `PaletteId`,
            // `SyncedAt` e `Id` quedan como estaban: si esta feature los tocara, subir un logo
            // dejaría al dueño sin los pedidos que tenía abiertos. Su ausencia aquí ES el
            // comportamiento, no un olvido.
            settings.LogoKey = logoKey;
            settings.BannerKey = bannerKey;

            // La PLANTILLA (vista) es PARCIAL como los lados de imagen: `null` o en blanco significa
            // "no la toco". El validador ya comprobó su formato cuando venía con valor.
            if (!string.IsNullOrWhiteSpace(request.TemplateId))
                settings.TemplateId = request.TemplateId.Trim();

            // El upsert del repositorio marca la entidad explícitamente (Add o Modified).
            // `ApplicationDbContext` es NoTracking, así que mutar la fila cargada y llamar a
            // `SaveChanges` sin marcar no escribiría NADA — sin error y sin aviso.
            await _storeCatalogSettingsRepository.UpsertAsync(settings);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(new StoreCatalogBrandingDto
            {
                LogoKey = settings.LogoKey,
                BannerKey = settings.BannerKey,
                PaletteId = string.IsNullOrWhiteSpace(settings.PaletteId)
                    ? StoreCatalogSettings.DefaultPaletteId
                    : settings.PaletteId,
                TemplateId = string.IsNullOrWhiteSpace(settings.TemplateId)
                    ? StoreCatalogSettings.DefaultTemplateId
                    : settings.TemplateId,
            });
        }

        /// <summary>
        /// Resuelve UN lado de la marca y devuelve la key con la que queda.
        ///
        ///   * Sin archivo y sin quitar → se devuelve la anterior sin tocar nada (el PUT parcial).
        ///   * Quitar → se borra el archivo y la key queda en null.
        ///   * Subir → se valida, se guarda, se borra la anterior si cambió y se devuelve la nueva.
        ///
        /// El orden importa: se guarda la NUEVA antes de borrar la anterior, y se persiste la key
        /// nueva. Si el borrado fallara, el catálogo público sigue sirviendo la imagen vieja desde su
        /// caché inmutable en vez de romperse con un 404.
        /// </summary>
        private async Task<string?> ResolveAsync(
            CatalogImageUpload? upload,
            bool remove,
            string? previousKey,
            string kind,
            Guid tenantId,
            Guid storeId,
            CancellationToken cancellationToken)
        {
            if (upload == null && !remove)
                return previousKey;

            if (remove)
            {
                await DeleteIfReplacedAsync(previousKey, null, cancellationToken);
                return null;
            }

            // Las MISMAS reglas que las imágenes de producto (jpg/jpeg/png/webp y 2 MB), con el mismo
            // 400 localizado. La marca no es una puerta distinta al contenido del catálogo.
            CatalogImageUploadRules.EnsureValid(upload!.FileName, upload.ContentType, upload.Length, _localizer);

            string key = await _catalogImageStorage.SaveBrandingAsync(upload, tenantId, storeId, kind, cancellationToken);
            await DeleteIfReplacedAsync(previousKey, key, cancellationToken);

            return key;
        }

        /// <summary>
        /// Borra el archivo de la key anterior, y SOLO si de verdad la reemplaza. Sin esta guarda,
        /// subir un logo donde ya había uno dejaría en el disco un archivo que ya nadie va a pedir.
        /// Quitar algo que no estaba no borra nada: no hay archivo, y no es un error.
        /// </summary>
        private Task DeleteIfReplacedAsync(string? previousKey, string? newKey, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrWhiteSpace(previousKey)
                && !string.Equals(previousKey, newKey, StringComparison.Ordinal))
            {
                return _catalogImageStorage.DeleteAsync(previousKey, cancellationToken);
            }

            return Task.CompletedTask;
        }
    }
}