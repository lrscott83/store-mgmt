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
        private readonly ICatalogStaticPageWriter _writer;
        private readonly CatalogStaticPageOptions _options;

        public CatalogStaticPageGenerator(
            IStoreRepository storeRepository,
            IStoreCatalogSettingsRepository settingsRepository,
            ICatalogStaticPageWriter writer,
            IOptions<CatalogStaticPageOptions> options)
        {
            _storeRepository = storeRepository;
            _settingsRepository = settingsRepository;
            _writer = writer;
            _options = options.Value;
        }

        public async Task<bool> GenerateAsync(Guid storeId, CancellationToken cancellationToken = default)
        {
            var store = await _storeRepository.GetStoreByIdAsync(storeId);
            if (store is null || string.IsNullOrWhiteSpace(store.CatalogSlug))
                return false;

            var baseUrl = _options.PublicBaseUrl?.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
                throw new InvalidOperationException("CatalogStaticPageOptions.PublicBaseUrl is not configured");

            var settings = await _settingsRepository.GetByStoreIdAsync(storeId);

            // Preferencia de imagen: logo, si no banner, si no nada.
            var imageKey = string.IsNullOrWhiteSpace(settings?.LogoKey) ? settings?.BannerKey : settings!.LogoKey;

            var slug = store.CatalogSlug;
            var meta = new CatalogStaticPageMeta(
                Title: store.Name,
                Description: store.Description,
                CanonicalUrl: baseUrl + CatalogPublicUrls.Catalog(slug),
                SiteName: store.Name,
                Locale: "es_ES",
                ImageUrl: string.IsNullOrWhiteSpace(imageKey)
                    ? null
                    : baseUrl + CatalogPublicUrls.Media(slug, imageKey));

            await _writer.WriteAsync(slug, meta, cancellationToken);
            return true;
        }
    }
}
