namespace Domain.Common.Enums
{
    /// <summary>
    /// Eventos de telemetría del sitio público (no de una tienda). Los valores numéricos quedan
    /// CONGELADOS: se persisten en la tabla `SiteEvent`.
    /// </summary>
    public enum SiteEventKind : int
    {
        /// <summary>Visita a una página pública: landing, login, register o legales.</summary>
        PageView = 1,

        /// <summary>Apertura del manual de usuario (HTML) o descarga de su PDF.</summary>
        ManualView = 2,
    }
}
