using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Stores;

namespace Domain.Entities.StoreCatalogSettings
{
    /// <summary>
    /// Configuración del CATÁLOGO WEB de una tienda: pedidos online (F1) y marca (F8).
    ///
    /// Decisión D7: una fila por tienda (índice único en <see cref="StoreId"/>), no columnas en
    /// `Store` — así la configuración y la marca se versionan y se desplegan juntas sin tocar la
    /// tabla de tiendas.
    ///
    /// Decisión D19: marca y configuración comparten la MISMA fila, porque ambas son "lo que el
    /// catálogo de esta tienda muestra y acepta".
    ///
    /// NO tiene columna <c>Currency</c> (A3 eliminada): los precios y la moneda del pedido salen
    /// del catálogo/producto, nunca de un ajuste de la tienda.
    /// </summary>
    public sealed class StoreCatalogSettings : AuditableEntity<Guid>, ITenantBaseEntity
    {
        /// <summary>Paleta por defecto: la que el catálogo ya usa hoy (plan 2026-09-27).</summary>
        public const string DefaultPaletteId = "default";

        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;

        // --- Pedidos online (F1) ---

        /// <summary>
        /// Interruptor maestro: sin esto la tienda NO acepta pedidos online. Por defecto `false`
        /// — una tienda con catálogo abierto no empieza a recibir pedidos porque se le publicly la
        /// URL, sino porque lo decide.
        /// </summary>
        public bool Enabled { get; set; } = false;
        /// <summary>Número de WhatsApp con el prefijo internacional (D17). null = sin WhatsApp.</summary>
        public string? WhatsappNumber { get; set; }
        /// <summary>Admite recogida en la tienda.</summary>
        public bool PickupEnabled { get; set; } = false;
        /// <summary>Admite envío a domicilio (exige dirección en el pedido y aplica <see cref="DeliveryFee"/>).</summary>
        public bool DeliveryEnabled { get; set; } = false;
        /// <summary>Costo de envío, en la moneda del catálogo. Se suma solo con <see cref="DeliveryEnabled"/>.</summary>
        public decimal DeliveryFee { get; set; } = 0m;
        /// <summary>Importe mínimo del pedido. 0 = sin mínimo.</summary>
        public decimal MinimumOrderAmount { get; set; } = 0m;
        /// <summary>Horario de atención como texto simple (D16). null = no publicado.</summary>
        public string? BusinessHours { get; set; }
        /// <summary>Zonas de reparto como texto simple (D16). null = todas.</summary>
        public string? DeliveryZones { get; set; }

        // --- Marca (F8) ---

        /// <summary>Clave de la imagen del logo. null = sin logo.</summary>
        public string? LogoKey { get; set; }
        /// <summary>Clave de la imagen del banner. null = sin banner.</summary>
        public string? BannerKey { get; set; }
        /// <summary>
        /// Id de la paleta que aplica el catálogo. Por defecto la actual
        /// (<see cref="DefaultPaletteId"/>), para que una fila recién creada no rompa el estilo.
        /// </summary>
        public string PaletteId { get; set; } = DefaultPaletteId;

        // --- Comunes ---

        public Guid TenantId { get; set; }
        /// <summary>Última sincronización del POS (solo diagnóstico; D14: no sincroniza pedidos).</summary>
        public DateTimeOffset? SyncedAt { get; set; }

        private StoreCatalogSettings(Guid id, Guid storeId, Guid tenantId) : base(id)
        {
            StoreId = storeId;
            TenantId = tenantId;
        }

        /// <summary>
        /// Crea la configuración de una tienda en su estado por defecto: pedidos cerrados, marca
        /// con la paleta actual. La fila nace DESACTIVADA a propósito (F1 la habilita explícitamente).
        /// </summary>
        public static StoreCatalogSettings Create(Guid storeId, Guid tenantId)
            => Create(Guid.NewGuid(), storeId, tenantId);

        /// <summary>
        /// Crea la configuración con un id CONOCIDO. Lo necesita el upsert de la configuración: al
        /// actualizar una fila existente hay que conservar SU id, y `Entity<TId>.Id` es `init`, así
        /// que la única forma de fijarlo es nacer con él (mismo criterio que `Product.Create(id, ...)`
        /// para el espejo del catálogo).
        /// </summary>
        public static StoreCatalogSettings Create(Guid id, Guid storeId, Guid tenantId)
        {
            var settings = new StoreCatalogSettings(id, storeId, tenantId);
            settings.Raise(new StoreCatalogSettingsCreatedDomainEvent(settings.Id, storeId));
            return settings;
        }
    }

    public sealed record StoreCatalogSettingsCreatedDomainEvent(Guid StoreCatalogSettingsId, Guid StoreId) : IDomainEvent;
}