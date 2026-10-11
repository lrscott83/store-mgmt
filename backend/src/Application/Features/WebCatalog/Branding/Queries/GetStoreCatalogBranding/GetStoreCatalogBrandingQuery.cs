using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Branding.Queries.GetStoreCatalogBranding
{
    /// <summary>
    /// Lee la MARCA (F8) de la tienda seleccionada, para la vista Catálogo Web (OwnerAdmin).
    ///
    /// Si la tienda todavía no tiene fila NO se devuelve un 404: se devuelven los valores por
    /// defecto. La razón es la misma que en la configuración de pedidos (F1) —una tienda recién
    /// sincronizada tiene catálogo publicado y aún no ha tocado su marca—, y un 404 obligaría al
    /// frontend a modelar "sin configurar" como un estado de error distinto del que ocurre cuando
    /// algo falla de verdad.
    ///
    /// Lectura EN SESIÓN (`GetByStoreIdAsync`), no la pública: el filtro global por tenant del
    /// `ApplicationDbContext` es lo que confina esta lectura a la tienda del contexto. La marca se
    /// edita en la vista de gestión, no desde el catálogo anónimo.
    /// </summary>
    public sealed record GetStoreCatalogBrandingQuery : IQuery<StoreCatalogBrandingDto>;

    public class GetStoreCatalogBrandingQueryHandler
        : IQueryHandler<GetStoreCatalogBrandingQuery, StoreCatalogBrandingDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreCatalogBrandingQueryHandler(
            IHttpContextService httpContextService,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreCatalogBrandingDto>> Handle(
            GetStoreCatalogBrandingQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetByStoreIdAsync(storeId);

            return ResponseResult.Success(settings is null ? Default() : Map(settings));
        }

        /// <summary>
        /// Sin marca: sin logo, sin banner y la paleta que el catálogo ya usa hoy. Es explícita en
        /// vez de <c>new DTO()</c> para que un campo nuevo de la entidad no se olvide aquí.
        /// </summary>
        private static StoreCatalogBrandingDto Default() => new()
        {
            LogoKey = null,
            BannerKey = null,
            PaletteId = StoreCatalogSettings.DefaultPaletteId,
        };

        private static StoreCatalogBrandingDto Map(StoreCatalogSettings settings) => new()
        {
            LogoKey = settings.LogoKey,
            BannerKey = settings.BannerKey,
            // Una fila con la paleta en blanco (vacía o solo espacios) es una fila rota: el
            // storefront tiene que pintar algo, así que cae a la paleta por defecto en vez de
            // devolver una cadena que no corresponde a ninguna paleta.
            PaletteId = string.IsNullOrWhiteSpace(settings.PaletteId)
                ? StoreCatalogSettings.DefaultPaletteId
                : settings.PaletteId,
        };
    }
}