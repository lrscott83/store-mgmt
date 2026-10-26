using Application.Features.WebCatalog.Public;

namespace Application.Features.SiteTelemetry
{
    /// <summary>
    /// Hashes anónimos de la telemetría del sitio público. No se guarda IP ni User-Agent.
    ///
    /// Reutiliza `CatalogTelemetryHash` (una sola implementación de crypto) pasando un namespace
    /// fijo del sitio en el lugar del `storeId` que usan los eventos del catálogo. El resultado es
    /// equivalente en privacidad: huella diaria distinta por día y por visitante, imposible de
    /// reconstruir sin el secreto de configuración.
    /// </summary>
    public static class SiteTelemetryHash
    {
        private static readonly Guid SiteNamespace = new("5b8f2c1e-9a44-4d76-8f0b-7c3d51a2e6b9");

        public static string Visitor(string? ipAddress, string? userAgent, DateTime utcNow, string? salt = null)
            => CatalogTelemetryHash.Visitor(SiteNamespace, ipAddress, userAgent, utcNow, salt);

        public static string Session(string visitorHash, DateTime utcNow)
            => CatalogTelemetryHash.Session(SiteNamespace, visitorHash, utcNow);
    }
}
