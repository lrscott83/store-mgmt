namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Rutas públicas del catálogo. El frontend (y los DTOs) reciben URLs listas para usar: el
    /// almacenamiento interno nunca se expone.
    /// </summary>
    public static class CatalogPublicUrls
    {
        /// <summary>Ruta del catálogo público dentro de la app (deep link del SPA).</summary>
        public static string Catalog(string storeSlug) => $"/catalog/{storeSlug}";

        /// <summary>Endpoint que sirve una imagen publicada.</summary>
        public static string Media(string storeSlug, string key)
            => $"/api/v1/public/catalog/{storeSlug}/media/{key}";
    }
}
