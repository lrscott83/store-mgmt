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
    /// OJO — filtro global por tenant: la configuración, las imágenes del showcase y los módulos de la
    /// tienda se leen con las lecturas PÚBLICAS del repositorio (`GetPublicByStoreIdAsync` /
    /// `GetPublicActiveModuleIdsByStoreIdAsync`), que saltan ese filtro. Con la lectura de sesión el
    /// anónimo no obtendría fila alguna. Ver la nota del handler y de los repositorios.
    ///
    /// Los DOS flags de módulo viajan aquí porque el storefront NO puede deducirlos: los módulos
    /// 19/20 son de TIENDA (`StoreModule.IsActive`), no del plan, así que "tiene catálogo" no dice
    /// nada sobre ellos. Sin los flags, el gating del carrito (M2) y del POST del checkout (M3)
    /// sería una suposición del cliente.
    ///
    /// El NÚMERO de WhatsApp también viaja aquí desde T5 (2026-10-10), y REVIERTE F4-T2. Antes
    /// solo volvía en la respuesta de creación, que solo recibe quien deja sus datos de contacto;
    /// pero el modo "solo Pedidos WhatsApp" (M3) NO crea `Order` y por tanto no tiene respuesta
    /// de creación, así que sin este campo el frontend no podría armar el `wa.me` de ese modo.
    /// No es un dato sensible —es el teléfono de contacto de un negocio, visible en su carta— y el
    /// gating del módulo 19 es lo que decide si el cliente ve siquiera un carrito.
    /// </summary>
    public sealed record GetPublicOrderingConfigQuery(string StoreSlug) : IQuery<PublicOrderingConfigDto>;

    public class GetPublicOrderingConfigQueryHandler
        : IQueryHandler<GetPublicOrderingConfigQuery, PublicOrderingConfigDto>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IStoreCatalogImageRepository _storeCatalogImageRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicOrderingConfigQueryHandler(
            IStoreRepository storeRepository,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStoreCatalogImageRepository storeCatalogImageRepository,
            IStoreModuleRepository storeModuleRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _storeCatalogImageRepository = storeCatalogImageRepository;
            _storeModuleRepository = storeModuleRepository;
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

            // Lectura PÚBLICA por el mismo motivo que la configuración y las imágenes: con la de
            // sesión el anónimo no obtendría fila alguna (no hay tenant en el contexto) y los flags
            // saldrían SIEMPRE en false — el storefront cerraría el carrito de una tienda que lo
            // compró, sin error y sin aviso. UNA sola lectura para los dos módulos.
            IReadOnlyCollection<int> activeModuleIds =
                await _storeModuleRepository.GetPublicActiveModuleIdsByStoreIdAsync(store.Id);

            return ResponseResult.Success(new PublicOrderingConfigDto
            {
                // Sin fila = pedidos cerrados. El interruptor lo enciende el dueño; que el catálogo
                // esté publicado no lo enciende por él.
                Enabled = settings?.Enabled ?? false,
                PickupEnabled = settings?.PickupEnabled ?? false,
                DeliveryEnabled = settings?.DeliveryEnabled ?? false,
                // GATING DE MÓDULOS (M2/M3). Los flags se sacan de los módulos ACTIVOS de la fila
                // `StoreModule` de esta tienda, que son de TIENDA y no del plan: sin fila el
                // conjunto sale vacío y los dos flags quedan en false, que es lo correcto para una
                // tienda que no compró ninguno de los dos módulos.
                PedidosWhatsAppEnabled = activeModuleIds.Contains((int)ModuleType.PedidosWhatsApp),
                GestionPedidosEnabled = activeModuleIds.Contains((int)ModuleType.GestionPedidos),
                // NÚMERO DE WHATSAPP (revierte F4-T2, 2026-10-10). Sale de la MISMA fila que el
                // resto de la configuración, sin ninguna lectura extra, y con la justificación
                // del modo SIN PERSISTENCIA: con solo el módulo 19 el checkout NO hace POST, así
                // que no hay respuesta de creación de la que sacarlo y sin este campo el frontend
                // no puede armar el `wa.me`. Sin fila (o con el número en blanco) sale null: no hay
                // a quién escribir, y el storefront bloquea el envío en vez de abrir un chat
                // contra un destinatario vacío.
                WhatsappNumber = string.IsNullOrWhiteSpace(settings?.WhatsappNumber)
                    ? null
                    : settings.WhatsappNumber,
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
        ///
        /// <c>IsActive</c> se exige explícitamente aunque la lectura pública del repositorio ya
        /// filtre por él. Es ENDURECIMIENTO del contrato, no una segunda defensa: "el catálogo público
        /// no publica imágenes desactivadas" es parte de lo que este método garantiza, y no debe
        /// depender de un detalle interno del repositorio. Si mañana esa lectura cambia, este filtro
        /// sigue sosteniendo el contrato.
        /// </summary>
        private static IReadOnlyList<PublicShowcaseImageDto> Showcase(
            IEnumerable<StoreCatalogImage> images, StoreCatalogImageKind kind, string storeSlug)
            => images
                .Where(image => image.Kind == kind && image.IsActive && !string.IsNullOrWhiteSpace(image.Key))
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
        ///
        /// El slug se exige con la MISMA guarda que la clave, y no solo `null`: una tienda con el
        /// slug en blanco no es un 404 (el handler solo rechaza `null`), y sin esta guarda el
        /// storefront recibiría <c>/api/v1/public/catalog//media/{key}</c> — una ruta con el slug
        /// vacío, que no corresponde a ninguna tienda y se pediría como si fuera un archivo. Null es
        /// la respuesta correcta: el storefront simplemente no pinta logo ni banner.
        /// </summary>
        private static string? MediaUrl(string? storeSlug, string? key)
            => string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(storeSlug)
                ? null
                : CatalogPublicUrls.Media(storeSlug, key);
    }
}