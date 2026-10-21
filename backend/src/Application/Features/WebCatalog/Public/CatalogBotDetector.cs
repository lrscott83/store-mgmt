namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Filtro de bots del endpoint de telemetría. No pretende ser exhaustivo: descarta los
    /// User-Agent más comunes de crawlers, previews y clientes HTTP para que las visitas del panel
    /// no se inflen con tráfico que nunca vio la página.
    ///
    /// NO filtra "WhatsApp": el navegador embebido de WhatsApp es un visitante real. Los previews
    /// de enlaces no ejecutan JavaScript, así que no llegan a mandar el beacon.
    /// </summary>
    public static class CatalogBotDetector
    {
        private static readonly string[] BotMarkers =
        [
            "googlebot",
            "bingbot",
            "yandexbot",
            "duckduckbot",
            "baiduspider",
            "semrushbot",
            "ahrefsbot",
            "petalbot",
            "crawler",
            "spider",
            "slurp",
            "bingpreview",
            "facebookexternalhit",
            "headless",
            "python-requests",
            "curl/",
            "wget/",
            "axios/",
            "node-fetch",
            "go-http-client",
        ];

        public static bool IsBot(string? userAgent)
        {
            if (string.IsNullOrWhiteSpace(userAgent))
                return true;

            string ua = userAgent.ToLowerInvariant();
            return BotMarkers.Any(marker => ua.Contains(marker, StringComparison.Ordinal));
        }
    }
}
