using Application.Services.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Options;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>Genera la página estática de un catálogo a partir de los datos de la tienda (S2).</summary>
    public interface ICatalogStaticPageGenerator
    {
        /// <summary>
        /// Genera la página del catálogo de <paramref name="storeId"/>. Devuelve <c>false</c> cuando no
        /// hay nada que generar (tienda inexistente o sin slug de catálogo); en ese caso no escribe.
        /// </summary>
        Task<bool> GenerateAsync(Guid storeId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// T3: reúne los datos que ya viven en la BD —nombre y descripción de la tienda, y la marca del
    /// catálogo (logo/banner)— y se los pasa al <see cref="ICatalogStaticPageWriter"/>. No decide
    /// CUÁNDO regenerar (eso es el disparador); solo sabe CÓMO construir la página de una tienda.
    /// </summary>
    public sealed class CatalogStaticPageGenerator : ICatalogStaticPageGenerator
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreCatalogSettingsRepository _settingsRepository;
        private readonly IProductRepository _productRepository;
        private readonly ICatalogStaticPageWriter _writer;
        private readonly CatalogStaticPageOptions _options;

        public CatalogStaticPageGenerator(
            IStoreRepository storeRepository,
            IStoreCatalogSettingsRepository settingsRepository,
            IProductRepository productRepository,
            ICatalogStaticPageWriter writer,
            IOptions<CatalogStaticPageOptions> options)
        {
            _storeRepository = storeRepository;
            _settingsRepository = settingsRepository;
            _productRepository = productRepository;
            _writer = writer;
            _options = options.Value;
        }

        public async Task<bool> GenerateAsync(Guid storeId, CancellationToken cancellationToken = default)
        {
            // Lecturas PÚBLICAS a propósito (T6): la página de un catálogo es pública, igual que
            // /catalog/<slug>, así que se resuelve sin sesión y sin filtro de tenant
            // (GetStoreByIdIgnoreQueryFiltersAsync / GetPublicByStoreIdAsync). Con los métodos que
            // aplican el filtro, la pasada del sincronizador —arranque de la API, sin tenant en el
            // contexto— no encontraría NADA: el filtro no puede coincidir con ninguna fila y
            // devolvería vacío sin error ni aviso. Los flujos que guardan (T4) siguen igual:
            // resuelven la tienda de su propio tenant y obtienen la misma fila.
            var store = await _storeRepository.GetStoreByIdIgnoreQueryFiltersAsync(storeId);
            if (store is null || string.IsNullOrWhiteSpace(store.CatalogSlug))
                return false;

            var baseUrl = _options.PublicBaseUrl?.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
                throw new InvalidOperationException("CatalogStaticPageOptions.PublicBaseUrl is not configured");

            var settings = await _settingsRepository.GetPublicByStoreIdAsync(storeId);

            var slug = store.CatalogSlug;

            // Preferencia de imagen: logo, si no banner, si no la imagen de marca por defecto (S5).
            var imageKey = string.IsNullOrWhiteSpace(settings?.LogoKey) ? settings?.BannerKey : settings!.LogoKey;
            var imageUrl = string.IsNullOrWhiteSpace(imageKey)
                ? baseUrl + NormalizePath(_options.DefaultImagePath)
                : baseUrl + CatalogPublicUrls.Media(slug, imageKey);

            // ItemList (S1): la MISMA consulta que sirve /api/v1/public/catalog/<slug>/products, así
            // el markup no puede discrepar de lo que ve el visitante: mismo filtro de publicado,
            // mismo orden (categoría, producto) y mismo precio efectivo.
            var products = await _productRepository.GetPublishedPageAsync(
                storeId,
                categorySlug: null,
                search: null,
                skip: 0,
                take: _options.EffectiveItemListSize,
                cancellationToken);

            var items = products
                .Select(product => new CatalogStaticPageItem(
                    Name: product.Name,
                    Price: product.FinalPrice,
                    Currency: product.Currency.ToString(),
                    ImageUrl: string.IsNullOrWhiteSpace(product.Image)
                        ? null
                        : baseUrl + CatalogPublicUrls.Media(slug, product.Image!)))
                .ToList();

            var meta = new CatalogStaticPageMeta(
                Title: store.Name,
                Description: store.Description,
                CanonicalUrl: baseUrl + CatalogPublicUrls.Catalog(slug),
                SiteName: store.Name,
                Locale: "es_ES",
                ImageUrl: imageUrl,
                Location: new CatalogStaticPageLocation(
                    Phone: store.PublicPhone,
                    StreetAddress: store.Address,
                    City: store.AddressCity,
                    Province: store.AddressProvince,
                    Latitude: store.Latitude,
                    Longitude: store.Longitude,
                    OpeningHours: OpeningHoursSerializer.Parse(store.OpeningHoursJson)),
                Items: items);

            await _writer.WriteAsync(slug, meta, cancellationToken);
            return true;
        }

        private static string NormalizePath(string? path)
            => string.IsNullOrWhiteSpace(path) ? "/og-image.png" : "/" + path.Trim().TrimStart('/');
    }
}
