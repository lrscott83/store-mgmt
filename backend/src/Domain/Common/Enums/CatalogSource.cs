namespace Domain.Common.Enums
{
    /// <summary>
    /// Origen de una visita al catálogo público. Se deriva en el servidor desde los parámetros UTM
    /// (prioridad) o desde el host del referrer. El valor numérico queda CONGELADO.
    /// </summary>
    public enum CatalogSource : int
    {
        /// <summary>Sin referrer ni UTM (tráfico directo, apps que ocultan el referrer, etc.).</summary>
        Direct = 0,

        /// <summary>Enlace abierto desde WhatsApp (`wa.me`, `api.whatsapp.com`, ...).</summary>
        WhatsApp = 1,

        /// <summary>Enlace abierto desde Instagram.</summary>
        Instagram = 2,

        /// <summary>Enlace abierto desde Facebook.</summary>
        Facebook = 3,

        /// <summary>Búsqueda orgánica en Google.</summary>
        Google = 4,

        /// <summary>Búsqueda orgánica en otro buscador (Bing, Yahoo, DuckDuckGo, ...).</summary>
        OtherSearch = 5,

        /// <summary>Referido desde otro sitio.</summary>
        Referral = 6,

        /// <summary>Campaña identificada por UTM cuyo origen no es uno de los anteriores.</summary>
        Campaign = 7,
    }
}
