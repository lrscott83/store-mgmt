using System.Text;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// T7 (S5): construye los dos archivos de descubrimiento para los rastreadores — sitemap.xml con
    /// una <c>&lt;url&gt;</c> por catálogo publicado (URL absoluta, la misma del canonical de cada
    /// página) y robots.txt, que lo referencia. Puro y determinista: recibe la URL base pública y los
    /// slugs; devuelve el contenido tal como se sirve.
    /// </summary>
    public static class CatalogStaticPageSitemapBuilder
    {
        private const string SitemapUrlPath = "/sitemap.xml";
        private const string UrlSetNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9";

        public static string BuildSitemap(string publicBaseUrl, IEnumerable<string> publishedSlugs)
        {
            if (string.IsNullOrWhiteSpace(publicBaseUrl))
                throw new ArgumentException("publicBaseUrl is required", nameof(publicBaseUrl));
            if (publishedSlugs is null)
                throw new ArgumentNullException(nameof(publishedSlugs));

            var baseUrl = publicBaseUrl.TrimEnd('/');

            var xml = new StringBuilder();
            xml.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            xml.Append("<urlset xmlns=\"").Append(UrlSetNamespace).Append("\">\n");
            // La landing pública va primero: es la página que describe el producto y la que el owner
            // quiere que los buscadores conozcan (auditoría SEO, 2026-10-20).
            xml.Append("  <url><loc>").Append(EscapeXml(baseUrl + "/")).Append("</loc></url>\n");
            // Orden ordinal estable: el mismo conjunto de catálogos produce el mismo archivo.
            foreach (var slug in publishedSlugs.OrderBy(slug => slug, StringComparer.Ordinal))
            {
                xml.Append("  <url><loc>")
                    .Append(EscapeXml(baseUrl + CatalogPublicUrls.Catalog(slug)))
                    .Append("</loc></url>\n");
            }
            xml.Append("</urlset>\n");
            return xml.ToString();
        }

        /// <summary>
        /// Rutas de la app que no son contenido público: el POS vive detrás de login y ninguna de
        /// ellas debe entrar al índice. La landing (`/`), los catálogos (`/catalog/&lt;slug&gt;`) y las
        /// páginas legales quedan fuera de esta lista a propósito.
        /// </summary>
        private static readonly string[] PrivateRoutePrefixes =
        {
            "/admin", "/auth", "/diagnostics", "/expenses", "/health", "/help", "/inventory",
            "/login", "/management", "/private-police", "/profile", "/register", "/reports",
            "/sales", "/stats", "/sync",
        };

        public static string BuildRobots(string publicBaseUrl)
        {
            if (string.IsNullOrWhiteSpace(publicBaseUrl))
                throw new ArgumentException("publicBaseUrl is required", nameof(publicBaseUrl));

            var baseUrl = publicBaseUrl.TrimEnd('/');

            var robots = new StringBuilder();
            robots.Append("User-agent: *\n");
            robots.Append("Allow: /\n");
            foreach (var prefix in PrivateRoutePrefixes)
                robots.Append("Disallow: ").Append(prefix).Append('\n');
            robots.Append('\n');
            // robots.txt es texto plano, no XML: la URL del sitemap va tal cual (sin escapar).
            robots.Append("Sitemap: ").Append(baseUrl).Append(SitemapUrlPath).Append('\n');
            return robots.ToString();
        }

        /// <summary>Escapa lo esencial del texto XML; los acentos se conservan (el archivo es UTF-8).</summary>
        private static string EscapeXml(string value)
        {
            var sb = new StringBuilder(value.Length);
            foreach (var c in value)
            {
                switch (c)
                {
                    case '&': sb.Append("&amp;"); break;
                    case '<': sb.Append("&lt;"); break;
                    case '>': sb.Append("&gt;"); break;
                    default: sb.Append(c); break;
                }
            }
            return sb.ToString();
        }
    }
}
