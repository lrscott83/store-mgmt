using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Branding;
using Application.ResponseModels;
using Domain.Common.Enums;
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
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreCatalogBrandingQueryHandler(
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStringLocalizer<I18n> localizer,
            IProductRepository productRepository)
        {
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _localizer = localizer;
            _productRepository = productRepository;
        }

        public async Task<ResponseResult<StoreCatalogBrandingDto>> Handle(
            GetStoreCatalogBrandingQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // "Sin fila" y "sin tienda" son dos cosas distintas y solo la segunda es un error. Una
            // tienda recién sincronizada sin marca tiene que seguir leyendo defaults (es la decisión
            // documentada arriba); una tienda que NO EXISTE es una petición mal dirigida y merece
            // 404, igual que ya hace `PUT branding`.
            //
            // Se ignora el filtro por tenant a propósito: `storeId` es la decisión de autorización
            // (ruta bajo `AdminStoreScope`+SuperAdmin, o claim del dueño) y el filtro global aplicaría
            // el tenant del LLAMADOR, escondiendo la tienda que la ruta acaba de apuntar.
            _ = await _storeRepository.GetStoreByIdIgnoreQueryFiltersAsync(storeId)
                ?? throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetByStoreIdAsync(storeId);

            CatalogPriceMode priceMode = ReadPriceMode(settings);

            // Se responde SIEMPRE, también en modo unidad: es un hecho de la tienda, y la vista no
            // debería deducirlo de otro endpoint. Cuesta un `EXISTS` en SQL, no el catálogo.
            bool hasWholesalePricedProducts =
                await _productRepository.HasWholesalePricedProductsAsync(storeId, cancellationToken);

            return ResponseResult.Success(settings is null
                ? Default(priceMode, hasWholesalePricedProducts)
                : Map(settings, priceMode, hasWholesalePricedProducts));
        }

        /// <summary>
        /// Modo guardado, normalizado: `Wholesale` solo si la fila dice exactamente eso. Una tienda
        /// sin fila —y una fila con un valor que ningún valor del enum representa— se lee como
        /// `Unit`, que es como el catálogo se publicaba antes de que el modo existiera.
        /// </summary>
        private static CatalogPriceMode ReadPriceMode(StoreCatalogSettings? settings)
            => settings?.PriceMode == CatalogPriceMode.Wholesale
                ? CatalogPriceMode.Wholesale
                : CatalogPriceMode.Unit;

        /// <summary>
        /// Sin marca: sin logo, sin banner y la paleta que el catálogo ya usa hoy. Es explícita en
        /// vez de <c>new DTO()</c> para que un campo nuevo de la entidad no se olvide aquí.
        /// </summary>
        private static StoreCatalogBrandingDto Default(
            CatalogPriceMode priceMode, bool hasWholesalePricedProducts) => new()
            {
                LogoKey = null,
                BannerKey = null,
                PaletteId = StoreCatalogSettings.DefaultPaletteId,
                MobileColumns = StoreCatalogSettings.DefaultMobileColumns,
                PriceMode = CatalogPriceModeWire.ToWire(priceMode),
                HasWholesalePricedProducts = hasWholesalePricedProducts,
            };

        private static StoreCatalogBrandingDto Map(
            StoreCatalogSettings settings, CatalogPriceMode priceMode, bool hasWholesalePricedProducts) => new()
            {
                LogoKey = settings.LogoKey,
                BannerKey = settings.BannerKey,
                // Una fila con la paleta en blanco (vacía o solo espacios) es una fila rota: el
                // storefront tiene que pintar algo, así que cae a la paleta por defecto en vez de
                // devolver una cadena que no corresponde a ninguna paleta.
                PaletteId = string.IsNullOrWhiteSpace(settings.PaletteId)
                    ? StoreCatalogSettings.DefaultPaletteId
                    : settings.PaletteId,
                // Una fila con un valor fuera de rango (una migración futura, un dato a mano) no puede
                // dejar la vista sin una opción válida seleccionada: se normaliza al default.
                MobileColumns = NormalizeMobileColumns(settings.MobileColumns),
                PriceMode = CatalogPriceModeWire.ToWire(priceMode),
                HasWholesalePricedProducts = hasWholesalePricedProducts,
            };

        /// <summary>
        /// Solo 1 y 2 son valores válidos de "elementos por fila en móvil". Cualquier otro valor
        /// de la fila se normaliza al default (2). El validador del command impide escribir fuera
        /// de rango, así que esto es endurecimiento del contrato de lectura, no una segunda puerta.
        /// </summary>
        private static int NormalizeMobileColumns(int value)
            => value is 1 or 2 ? value : StoreCatalogSettings.DefaultMobileColumns;
    }
}