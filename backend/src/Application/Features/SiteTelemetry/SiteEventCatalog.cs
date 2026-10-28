namespace Application.Features.SiteTelemetry
{
    /// <summary>
    /// Catálogo CERRADO de lo que se mide en el sitio público. Es la única copia de la regla:
    /// si un path no está aquí, no se guarda. Nada de paths crudos del cliente en la tabla.
    ///
    /// Lo que NO se mide a propósito: `/help/tutorial`, `/diagnostics`, `/auth/provision`, el 404
    /// y cualquier `/api/*` autenticado. El catálogo público (`/catalog/<slug>`) ya tiene su propia
    /// telemetría por tienda (`CatalogEvent`) y no se duplica aquí.
    /// </summary>
    public static class SiteEventCatalog
    {
        /// <summary>Segmento del manual servido como archivo estático por el backend.</summary>
        public const string ManualRootPath = "/api/manual";

        /// <summary>Path canónico del manual HTML (normaliza `/api/manual` y `/index.html`).</summary>
        public const string ManualHtmlPath = "/api/manual/";

        /// <summary>Path canónico del PDF del manual. Es una entrada INDEPENDIENTE del HTML.</summary>
        public const string ManualPdfPath = "/api/manual/manual-usuario-pos.pdf";

        private static readonly HashSet<string> PagePaths = new(StringComparer.Ordinal)
        {
            "/",
            "/login",
            "/register",
            "/private-police",
            "/terms-conditions",
        };

        /// <summary>Páginas públicas que el beacon del cliente puede reportar.</summary>
        public static IReadOnlyCollection<string> TrackedPagePaths => PagePaths;

        /// <summary>
        /// Normaliza y valida el path de una página pública. Devuelve el path canónico, o `null`
        /// cuando la página no se mide (lista cerrada: no hay fallback).
        /// </summary>
        public static string? NormalizePagePath(string? path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return null;

            string value = path.Trim();
            if (value.Contains("://", StringComparison.Ordinal) || value.Any(char.IsControl))
                return null;

            if (!value.StartsWith('/'))
                return null;

            string withoutQuery = StripQueryAndFragment(value);
            string normalized = withoutQuery.Length > 1 ? withoutQuery.TrimEnd('/') : withoutQuery;
            if (normalized.Length == 0)
                normalized = "/";

            return PagePaths.Contains(normalized) ? normalized : null;
        }

        /// <summary>
        /// Resuelve una entrada al manual. Solo cuenta `200` (un `304` es revalidación, no una
        /// visita nueva) y solo la entrada del HTML y la descarga del PDF: las imágenes
        /// (`/api/manual/images/*`) quedan fuera para no inflar el conteo con una por imagen.
        /// </summary>
        public static bool TryResolveManualView(string? path, int statusCode, out string canonicalPath)
        {
            canonicalPath = string.Empty;

            if (statusCode != 200 || string.IsNullOrWhiteSpace(path))
                return false;

            string value = StripQueryAndFragment(path.Trim());
            if (!value.StartsWith(ManualRootPath, StringComparison.Ordinal))
                return false;

            string normalized = value.Length > 1 ? value.TrimEnd('/') : value;

            if (normalized is ManualRootPath or "/api/manual/index.html")
            {
                canonicalPath = ManualHtmlPath;
                return true;
            }

            if (normalized == ManualPdfPath)
            {
                canonicalPath = ManualPdfPath;
                return true;
            }

            return false;
        }

        private static string StripQueryAndFragment(string value)
        {
            int index = value.IndexOfAny(['?', '#']);
            return index < 0 ? value : value[..index];
        }
    }
}
