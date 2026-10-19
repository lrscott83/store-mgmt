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

        public static string BuildRobots(string publicBaseUrl)
        {
            if (string.IsNullOrWhiteSpace(publicBaseUrl))
                throw new ArgumentException("publicBaseUrl is required", nameof(publicBaseUrl));

            var baseUrl = publicBaseUrl.TrimEnd('/');

            // robots.txt es texto plano, no XML: la URL del sitemap va tal cual (sin escapar).
            return "User-agent: *\n" +
                   "Allow: /\n" +
                   "\n" +
                   "Sitemap: " + baseUrl + SitemapUrlPath + "\n";
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
