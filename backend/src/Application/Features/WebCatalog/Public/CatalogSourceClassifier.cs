using Domain.Common.Enums;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Clasifica el origen de una visita. Los UTM mandan; si no vienen, se usa el host del
    /// referrer. WhatsApp suele abrir el enlace en un navegador embebido que NO envía referrer, así
    /// que un enlace compartido sin `utm_source=whatsapp` cae en <see cref="CatalogSource.Direct"/>:
    /// por eso el panel recomienda usar enlaces con UTM.
    /// </summary>
    public static class CatalogSourceClassifier
    {
        public static (CatalogSource Source, string? ReferrerHost) Resolve(
            string? utmSource, string? utmMedium, string? referrer)
        {
            string? host = HostFrom(referrer);

            CatalogSource? fromUtm = FromUtm(utmSource, utmMedium);
            if (fromUtm.HasValue)
                return (fromUtm.Value, host);

            if (host is null)
                return (CatalogSource.Direct, null);

            return (FromHost(host), host);
        }

        private static CatalogSource? FromUtm(string? utmSource, string? utmMedium)
        {
            string source = (utmSource ?? string.Empty).Trim().ToLowerInvariant();

            if (source.Length == 0)
                return string.IsNullOrWhiteSpace(utmMedium) ? null : CatalogSource.Campaign;

            if (source.Contains("whatsapp") || source == "wa")
                return CatalogSource.WhatsApp;
            if (source.Contains("instagram") || source == "ig")
                return CatalogSource.Instagram;
            if (source.Contains("facebook") || source == "fb")
                return CatalogSource.Facebook;
            if (source.Contains("google"))
                return CatalogSource.Google;

            // Cualquier UTM reconocible es una campaña, aunque el origen no sea una red conocida.
            return CatalogSource.Campaign;
        }

        private static CatalogSource FromHost(string host)
        {
            if (host is "wa.me" or "api.whatsapp.com" or "web.whatsapp.com" or "whatsapp.com"
                || host.EndsWith(".whatsapp.com"))
                return CatalogSource.WhatsApp;

            if (host is "instagram.com" or "l.instagram.com" || host.EndsWith(".instagram.com"))
                return CatalogSource.Instagram;

            if (host is "facebook.com" or "fb.com" or "lm.facebook.com" or "m.facebook.com"
                || host.EndsWith(".facebook.com"))
                return CatalogSource.Facebook;

            if (host == "google.com" || host.StartsWith("google.") || host.Contains(".google."))
                return CatalogSource.Google;

            if (host is "bing.com" or "www.bing.com" or "yahoo.com" or "duckduckgo.com"
                or "yandex.com" or "yandex.ru")
                return CatalogSource.OtherSearch;

            return CatalogSource.Referral;
        }

        private static string? HostFrom(string? referrer)
        {
            if (string.IsNullOrWhiteSpace(referrer))
                return null;

            if (!Uri.TryCreate(referrer.Trim(), UriKind.Absolute, out Uri? uri) || string.IsNullOrEmpty(uri.Host))
                return null;

            string host = uri.Host.ToLowerInvariant();
            return host.StartsWith("www.") ? host[4..] : host;
        }
    }
}
