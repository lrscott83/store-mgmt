using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.WebCatalog.Public;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderingConfig
{
    /// <summary>
    /// Configuración de pedidos que lee el storefront, por slug (anónimo).
    ///
    /// Es la puerta de entrada del pedido online: el carrito solo se ofrece si esto responde
    /// `Enabled = true`. Por eso una tienda SIN fila no es un 404 sino `Enabled = false` — acaba
    /// de sincronizar el catálogo y todavía no ha abierto pedidos; el catálogo público y los
    /// pedidos son dos interruptores distintos.
    ///
    /// 404 uniforme, igual que <c>GetPublicCatalogQuery</c>: un slug que no existe y una tienda sin
    /// catálogo publicado responden EXACTAMENTE igual, para que el anónimo no pueda usar el
    /// endpoint para averiguar qué tiendas existen.
    ///
    /// OJO — filtro global por tenant: la configuración y las imágenes del showcase se leen con
    /// `GetPublicByStoreIdAsync`, la lectura PÚBLICA del repositorio, que salta ese filtro. Con la
    /// lectura de sesión el anónimo no obtendría fila alguna. Ver la nota del handler y del repositorio.
    /// </summary>
    public sealed record GetPublicOrderingConfigQuery(string StoreSlug) : IQuery<PublicOrderingConfigDto>;

    public class GetPublicOrderingConfigQueryHandler
        : IQueryHandler<GetPublicOrderingConfigQuery, PublicOrderingConfigDto>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IStoreCatalogImageRepository _storeCatalogImageRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicOrderingConfigQueryHandler(
            IStoreRepository storeRepository,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStoreCatalogImageRepository storeCatalogImageRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _storeCatalogImageRepository = storeCatalogImageRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<PublicOrderingConfigDto>> Handle(
            GetPublicOrderingConfigQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || store.CatalogSlug == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            // Lectura PÚBLICA, no la de sesión: `GetPublicByStoreIdAsync` salta el filtro global
            // por tenant, que en una petición anónima no puede coincidir con ninguna fila (el
            // anónimo no tiene tenant en el contexto). Con la lectura de sesión esta query
            // devolvería VACÍA siempre y el storefront vería `Enabled = false` para siempre.
            // Lo que acota el resultado es el `StoreId`, que el slug ya resolvió y es único global.
            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetPublicByStoreIdAsync(store.Id);
            IList<StoreCatalogImage> images = await ReadShowcaseAsync(store);

            return ResponseResult.Success(new PublicOrderingConfigDto
            {
                // Sin fila = pedidos cerrados. El interruptor lo enciende el dueño; que el catálogo
                // esté publicado no lo enciende por él.
                Enabled = settings?.Enabled ?? false,
                PickupEnabled = settings?.PickupEnabled ?? false,
                DeliveryEnabled = settings?.DeliveryEnabled ?? false,
                DeliveryFee = settings?.DeliveryFee ?? 0m,
                MinimumOrderAmount = settings?.MinimumOrderAmount ?? 0m,
                BusinessHours = settings?.BusinessHours,
                DeliveryZones = settings?.DeliveryZones,
                // La MARCA (F8) viaja como URL pública del endpoint de media, nunca como clave
                // cruda: la clave es una ruta interna de almacenamiento y este config lo lee
                // cualquiera que abra el catálogo. Sin clave (o sin fila) la URL es null, y el
                // storefront simplemente no pinta logo ni banner.
                LogoUrl = MediaUrl(store.CatalogSlug, settings?.LogoKey),
                BannerUrl = MediaUrl(store.CatalogSlug, settings?.BannerKey),
                // El storefront siempre tiene que pintar algo: sin fila (o con una paleta en
                // blanco) se cae a la paleta que el catálogo ya usa hoy.
                PaletteId = string.IsNullOrWhiteSpace(settings?.PaletteId)
                    ? StoreCatalogSettings.DefaultPaletteId
                    : settings.PaletteId,
                // La PLANTILLA (vista) viaja igual que la paleta: sin fila, o en blanco, el storefront
                // usa la plantilla actual para no romperse. Es un id predefinido, no un color.
                TemplateId = string.IsNullOrWhiteSpace(settings?.TemplateId)
                    ? StoreCatalogSettings.DefaultTemplateId
                    : settings.TemplateId,
                // El SHOWCASE se lee UNA vez para los dos conjuntos (ver `ReadShowcaseAsync`), y viaja igual que
                // la marca: URL pública del endpoint de media, nunca la
                // clave cruda. Sin imágenes —una tienda recién sincronizada, o una que no quiere
                // carrusel— las dos listas salen VACÍAS y el storefront no pinta ni carrusel ni
                // bloque del día, que es exactamente como debe verse el catálogo de una tienda que no
                // los configuró.
                CarouselImages = Showcase(images, StoreCatalogImageKind.Carousel, store.CatalogSlug),
                DailyImages = Showcase(images, StoreCatalogImageKind.Daily, store.CatalogSlug),
            });
        }

        /// <summary>
        /// Lectura PÚBLICA de las imágenes del showcase, por el mismo motivo que la configuración de
        /// arriba: sin `IgnoreQueryFilters` una petición anónima no obtendría fila alguna — el filtro
        /// global por tenant no puede coincidir sin tenant en el contexto — y el carrusel se vería
        /// siempre vacío, sin error ni aviso. Lo que acota el resultado es el `StoreId`, que el slug ya
        /// resolvió y es único global.
        ///
        /// UNA sola lectura para los dos conjuntos: son las mismas filas y leerlas dos veces haría dos
        /// viajes a la base para pintar dos bloques. Además, de una lista sale que las dos secciones del
        /// storefront reflejan la MISMA foto de la tienda.
        /// </summary>
        private async Task<IList<StoreCatalogImage>> ReadShowcaseAsync(Store store)
            => await _storeCatalogImageRepository.GetPublicByStoreIdAsync(store.Id);

        /// <summary>
        /// Imágenes de UN conjunto del showcase, ya como URLs públicas.
        ///
        /// El repositorio ya devuelve la lista ordenada por <c>OrderIndex</c> y aquí no se reordena,
        /// para que la primera imagen del carrusel sea la que el dueño puso primera. Una key en blanco
        /// se filtra: construiría una URL `/media/` que el storefront pediría como si fuera un
        /// directorio.
        /// </summary>
        private static IReadOnlyList<PublicShowcaseImageDto> Showcase(
            IEnumerable<StoreCatalogImage> images, StoreCatalogImageKind kind, string storeSlug)
            => images
                .Where(image => image.Kind == kind && !string.IsNullOrWhiteSpace(image.Key))
                .Select(image => new PublicShowcaseImageDto
                {
                    Url = CatalogPublicUrls.Media(storeSlug, image.Key),
                    Caption = image.Caption,
                })
                .ToList();

        /// <summary>
        /// URL pública de una imagen de MARCA, o null si no hay clave (o no hay slug).
        ///
        /// Se construye con <c>CatalogPublicUrls.Media</c>, el MISMO builder que usan las imágenes
        /// de producto: por eso el logo y el banner se sirven con el endpoint de media que ya
        /// existe, sin un caso nuevo. La clave de marca pasa su <c>BelongsToStore</c> porque
        /// comparte el prefijo <c>{tenant}/{store}/</c>.
        /// </summary>
        private static string? MediaUrl(string? storeSlug, string? key)
            => string.IsNullOrWhiteSpace(key) ? null : CatalogPublicUrls.Media(storeSlug!, key);
    }
}