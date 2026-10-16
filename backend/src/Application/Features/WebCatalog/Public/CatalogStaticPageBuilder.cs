using System.Text;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Metadatos que un catálogo público debe exponer en el HTML servido: lo que los rastreadores
    /// (Google y, sobre todo, WhatsApp/Facebook/Telegram, que NO ejecutan JavaScript) necesitan leer
    /// sin ejecutar el SPA.
    /// </summary>
    public sealed record CatalogStaticPageMeta(
        string Title,
        string? Description,
        string CanonicalUrl,
        string SiteName,
        string Locale = "es_ES",
        string? ImageUrl = null);

    /// <summary>
    /// Construye la página estática de un catálogo público inyectando los metadatos en el shell del
    /// SPA. Puro: recibe el HTML del shell y devuelve el HTML servible. El cuerpo del SPA no se toca
    /// — solo se agrega/actualiza contenido dentro de <c>&lt;head&gt;</c>.
    ///
    /// Por qué así: el frontend es un SPA (<c>ssr:false</c>) que sirve un único index.html para todas
    /// las rutas; los rastreadores sociales no ejecutan JS, así que título/descripción/OG tienen que
    /// estar escritos en el HTML que se sirve (por eso se pre-genera y nginx lo sirve directo).
    /// </summary>
    public static class CatalogStaticPageBuilder
    {
        public static string Build(string shellHtml, CatalogStaticPageMeta meta)
        {
            if (string.IsNullOrWhiteSpace(shellHtml))
                throw new ArgumentException("shellHtml is required", nameof(shellHtml));
            if (meta is null)
                throw new ArgumentNullException(nameof(meta));

            var headClose = shellHtml.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            if (headClose < 0)
                throw new ArgumentException("shell HTML has no </head>", nameof(shellHtml));

            var head = shellHtml[..headClose];
            var tail = shellHtml[headClose..];

            // Sin duplicados: si el shell ya traía title/description, se reemplazan.
            head = RemoveElement(head, "<title", "</title>");
            head = RemoveMetaByName(head, "description");

            var tags = new StringBuilder();
            tags.Append("<title>").Append(Text(meta.Title)).Append("</title>");
            if (HasText(meta.Description))
                tags.Append("<meta name=\"description\" content=\"").Append(Attr(meta.Description!)).Append("\" />");
            tags.Append("<link rel=\"canonical\" href=\"").Append(Attr(meta.CanonicalUrl)).Append("\" />");
            tags.Append("<meta property=\"og:type\" content=\"website\" />");
            tags.Append("<meta property=\"og:title\" content=\"").Append(Attr(meta.Title)).Append("\" />");
            if (HasText(meta.Description))
                tags.Append("<meta property=\"og:description\" content=\"").Append(Attr(meta.Description!)).Append("\" />");
            tags.Append("<meta property=\"og:url\" content=\"").Append(Attr(meta.CanonicalUrl)).Append("\" />");
            if (HasText(meta.ImageUrl))
                tags.Append("<meta property=\"og:image\" content=\"").Append(Attr(meta.ImageUrl!)).Append("\" />");
            tags.Append("<meta property=\"og:site_name\" content=\"").Append(Attr(meta.SiteName)).Append("\" />");
            tags.Append("<meta property=\"og:locale\" content=\"").Append(Attr(meta.Locale)).Append("\" />");
            tags.Append("<meta name=\"twitter:card\" content=\"summary_large_image\" />");

            return head + tags + tail;
        }

        private static bool HasText(string? value) => !string.IsNullOrWhiteSpace(value);

        /// <summary>
        /// Escapa solo lo esencial para HTML y conserva el resto tal cual (el documento es UTF-8, así
        /// que los acentos NO se convierten en entidades numéricas — importa para lo que muestran los
        /// rastreadores al decodificar).
        /// </summary>
        private static string Text(string value) => Escape(value, forAttribute: false);

        /// <summary>Escapa para contenido de atributo (incluye comillas).</summary>
        private static string Attr(string value) => Escape(value, forAttribute: true);

        private static string Escape(string value, bool forAttribute)
        {
            var sb = new StringBuilder(value.Length + 8);
            foreach (var c in value)
            {
                switch (c)
                {
                    case '&': sb.Append("&amp;"); break;
                    case '<': sb.Append("&lt;"); break;
                    case '>': sb.Append("&gt;"); break;
                    case '"' when forAttribute: sb.Append("&quot;"); break;
                    case '\'' when forAttribute: sb.Append("&#39;"); break;
                    default: sb.Append(c); break;
                }
            }
            return sb.ToString();
        }

        /// <summary>Elimina un elemento completo (apertura→cierre) cuantas veces aparezca.</summary>
        private static string RemoveElement(string html, string openToken, string closeToken)
        {
            while (true)
            {
                var start = html.IndexOf(openToken, StringComparison.OrdinalIgnoreCase);
                if (start < 0) return html;
                var end = html.IndexOf(closeToken, start, StringComparison.OrdinalIgnoreCase);
                if (end < 0) return html;
                html = html.Remove(start, end - start + closeToken.Length);
            }
        }

        /// <summary>Elimina toda etiqueta &lt;meta name="..."&gt;, sin importar el orden de atributos.</summary>
        private static string RemoveMetaByName(string html, string name)
        {
            while (true)
            {
                var at = FindAttributeValue(html, "name", name);
                if (at < 0) return html;
                var start = html.LastIndexOf("<meta", at, StringComparison.OrdinalIgnoreCase);
                if (start < 0) return html;
                var end = html.IndexOf('>', at);
                if (end < 0) return html;
                html = html.Remove(start, end - start + 1);
            }
        }

        /// <summary>Índice del valor del atributo (comillas dobles o simples); -1 si no existe.</summary>
        private static int FindAttributeValue(string html, string attribute, string value)
        {
            var doubleQuoted = html.IndexOf($"{attribute}=\"{value}\"", StringComparison.OrdinalIgnoreCase);
            if (doubleQuoted >= 0) return doubleQuoted;
            var singleQuoted = html.IndexOf($"{attribute}='{value}'", StringComparison.OrdinalIgnoreCase);
            return singleQuoted;
        }
    }
}
