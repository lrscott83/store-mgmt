using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Entities.Stores;

namespace Domain.Entities.CatalogEvents
{
    /// <summary>
    /// Un evento anónimo del catálogo público: page view, producto visto, carrito o checkout.
    ///
    /// La tabla es APPEND-ONLY y no guarda PII: ni IP ni User-Agent. `VisitorHash` es un hash
    /// diario (tienda + día + IP + UA) y `SessionHash` agrupa eventos de una misma visita en una
    /// ventana de 30 minutos. Los hashes se calculan en el servidor; el cliente solo manda el
    /// nombre del evento, la ruta, el producto (si aplica), el referrer y los UTM.
    ///
    /// No usa `AuditableEntity`: `OccurredAt` (UTC, decidido por el servidor) es el único tiempo
    /// que importa para las estadísticas.
    /// </summary>
    public sealed class CatalogEvent : Entity<Guid>, ITenantBaseEntity
    {
        public const int PathMaxLength = 200;
        public const int HashMaxLength = 64;
        public const int ReferrerHostMaxLength = 200;
        public const int UtmMaxLength = 100;

        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public Guid TenantId { get; set; }

        /// <summary>Momento del evento en UTC, fijado por el servidor (nunca por el cliente).</summary>
        public DateTime OccurredAt { get; set; }

        public CatalogEventType Type { get; set; }

        /// <summary>Hash diario del visitante (sin IP ni UA persistidos).</summary>
        public string VisitorHash { get; set; } = string.Empty;

        /// <summary>Hash de la visita (ventana de 30 minutos) para contar sesiones.</summary>
        public string SessionHash { get; set; } = string.Empty;

        /// <summary>Ruta del catálogo, sin host ni query (p. ej. `/catalog/mi-tienda`).</summary>
        public string Path { get; set; } = string.Empty;

        /// <summary>Producto visto o agregado; null en los eventos de página/checkout.</summary>
        public Guid? ProductId { get; set; }

        public CatalogSource Source { get; set; }

        /// <summary>Host del referrer, truncado. null si no vino referrer.</summary>
        public string? ReferrerHost { get; set; }

        public string? UtmSource { get; set; }
        public string? UtmMedium { get; set; }
        public string? UtmCampaign { get; set; }

        public CatalogDeviceType DeviceType { get; set; }

        private CatalogEvent(Guid id, Guid storeId, Guid tenantId, DateTime occurredAt, CatalogEventType type,
            string visitorHash, string sessionHash, string path, Guid? productId, CatalogSource source,
            string? referrerHost, string? utmSource, string? utmMedium, string? utmCampaign,
            CatalogDeviceType deviceType) : base(id)
        {
            StoreId = storeId;
            TenantId = tenantId;
            OccurredAt = occurredAt;
            Type = type;
            VisitorHash = visitorHash;
            SessionHash = sessionHash;
            Path = path;
            ProductId = productId;
            Source = source;
            ReferrerHost = referrerHost;
            UtmSource = utmSource;
            UtmMedium = utmMedium;
            UtmCampaign = utmCampaign;
            DeviceType = deviceType;
        }

        public static CatalogEvent Create(Guid storeId, Guid tenantId, DateTime occurredAt, CatalogEventType type,
            string visitorHash, string sessionHash, string path, Guid? productId, CatalogSource source,
            string? referrerHost, string? utmSource, string? utmMedium, string? utmCampaign,
            CatalogDeviceType deviceType)
            => new(Guid.NewGuid(), storeId, tenantId, occurredAt, type, visitorHash, sessionHash, path,
                productId, source, referrerHost, utmSource, utmMedium, utmCampaign, deviceType);
    }
}
