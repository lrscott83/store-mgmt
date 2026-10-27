using Domain.Common.Entities;
using Domain.Common.Enums;

namespace Domain.Entities.SiteTelemetry
{
    /// <summary>
    /// Un evento anónimo del sitio público que no pertenece a ninguna tienda: una vista de página
    /// (landing, login, register, legales) o una entrada al manual de usuario (HTML o PDF).
    ///
    /// La tabla es APPEND-ONLY y no guarda PII: ni IP ni User-Agent. `VisitorHash` es un hash
    /// diario (día + IP + UA) y `SessionHash` agrupa eventos de una misma visita en una ventana de
    /// 30 minutos. Los hashes se calculan en el servidor reutilizando `CatalogTelemetryHash` con un
    /// namespace fijo del sitio en lugar del `storeId` del catálogo.
    ///
    /// No usa `AuditableEntity` ni `ITenantBaseEntity`: `OccurredAt` (UTC, decidido por el
    /// servidor) es el único tiempo que importa, y el sitio no es multi-tenant.
    /// </summary>
    public sealed class SiteEvent : Entity<Guid>
    {
        public const int PathMaxLength = 200;
        public const int HashMaxLength = 64;
        public const int ReferrerHostMaxLength = 200;
        public const int UtmMaxLength = 100;

        /// <summary>Momento del evento en UTC, fijado por el servidor (nunca por el cliente).</summary>
        public DateTime OccurredAt { get; set; }

        public SiteEventKind Kind { get; set; }

        /// <summary>
        /// Ruta canónica ya normalizada por `SiteEventCatalog`. Nunca es un path crudo del cliente:
        /// las páginas se validan contra una lista y el manual se resuelve a dos valores fijos.
        /// </summary>
        public string Path { get; set; } = string.Empty;

        /// <summary>Código HTTP de la respuesta que originó el evento. Solo en `ManualView`.</summary>
        public int? StatusCode { get; set; }

        /// <summary>Hash diario del visitante (sin IP ni UA persistidos).</summary>
        public string VisitorHash { get; set; } = string.Empty;

        /// <summary>Hash de la visita (ventana de 30 minutos) para contar sesiones.</summary>
        public string SessionHash { get; set; } = string.Empty;

        public CatalogSource Source { get; set; }

        /// <summary>Host del referrer, truncado. null si no vino referrer.</summary>
        public string? ReferrerHost { get; set; }

        public string? UtmSource { get; set; }
        public string? UtmMedium { get; set; }
        public string? UtmCampaign { get; set; }

        public CatalogDeviceType DeviceType { get; set; }

        private SiteEvent(Guid id, DateTime occurredAt, SiteEventKind kind, string path, int? statusCode,
            string visitorHash, string sessionHash, CatalogSource source, string? referrerHost,
            string? utmSource, string? utmMedium, string? utmCampaign, CatalogDeviceType deviceType)
            : base(id)
        {
            OccurredAt = occurredAt;
            Kind = kind;
            Path = path;
            StatusCode = statusCode;
            VisitorHash = visitorHash;
            SessionHash = sessionHash;
            Source = source;
            ReferrerHost = referrerHost;
            UtmSource = utmSource;
            UtmMedium = utmMedium;
            UtmCampaign = utmCampaign;
            DeviceType = deviceType;
        }

        /// <summary>Vista de una página pública del sitio (beacon del cliente).</summary>
        public static SiteEvent CreatePageView(DateTime occurredAt, string path, string visitorHash,
            string sessionHash, CatalogSource source, string? referrerHost, string? utmSource,
            string? utmMedium, string? utmCampaign, CatalogDeviceType deviceType)
            => new(Guid.NewGuid(), occurredAt, SiteEventKind.PageView, path, null, visitorHash, sessionHash,
                source, referrerHost, utmSource, utmMedium, utmCampaign, deviceType);

        /// <summary>Entrada al manual de usuario (HTML o PDF), contada en el servidor.</summary>
        public static SiteEvent CreateManualView(DateTime occurredAt, string path, int statusCode,
            string visitorHash, string sessionHash, CatalogSource source, string? referrerHost,
            CatalogDeviceType deviceType)
            => new(Guid.NewGuid(), occurredAt, SiteEventKind.ManualView, path, statusCode, visitorHash,
                sessionHash, source, referrerHost, null, null, null, deviceType);
    }
}
