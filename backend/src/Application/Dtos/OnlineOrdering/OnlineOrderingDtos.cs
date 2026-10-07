using Domain.Entities.StoreCatalogSettings;

namespace Application.Dtos.OnlineOrdering
{
    /// <summary>
    /// Configuración de pedidos online de UNA tienda, tal como la ve su dueño (F1, vista
    /// "Pedidos WhatsApp"). Son SOLO las columnas de pedidos: la marca (`LogoKey`/`BannerKey`/
    /// `PaletteId`) es de F8 y se configura en la vista Catálogo Web, así que no viaja aquí —
    /// que viaje haría que las dos vistas escribieran la misma fila desde dos contratos distintos.
    ///
    /// Sin `Currency` (A3 eliminada): los precios y la moneda los pone el catálogo.
    /// </summary>
    public sealed class StoreCatalogSettingsDto
    {
        /// <summary>
        /// Interruptor maestro. Sin esto la tienda NO acepta pedidos: publicar el catálogo no
        /// publica los pedidos (son dos interruptores distintos) y la fila nace apagada.
        /// </summary>
        public bool Enabled { get; set; }

        /// <summary>Número de WhatsApp con prefijo internacional (D17), para armar el enlace `wa.me`.</summary>
        public string? WhatsappNumber { get; set; }

        /// <summary>Admite recogida en la tienda.</summary>
        public bool PickupEnabled { get; set; }

        /// <summary>Admite envío a domicilio (el pedido exige dirección y suma <see cref="DeliveryFee"/>).</summary>
        public bool DeliveryEnabled { get; set; }

        /// <summary>Costo de envío, en la moneda del catálogo. 0 = envío gratis.</summary>
        public decimal DeliveryFee { get; set; }

        /// <summary>Importe mínimo del pedido. 0 = sin mínimo.</summary>
        public decimal MinimumOrderAmount { get; set; }

        /// <summary>Horario de atención como texto simple (D16). null = no publicado.</summary>
        public string? BusinessHours { get; set; }

        /// <summary>Zonas de reparto como texto simple (D16). null = todas.</summary>
        public string? DeliveryZones { get; set; }

        /// <summary>Última sincronización de esta configuración desde el POS (diagnóstico).</summary>
        public DateTimeOffset? SyncedAt { get; set; }
    }

    /// <summary>
    /// Lo que el storefront lee de una tienda para ofrecer el pedido online (anónimo). Tres
    /// decisiones que son parte del contrato, no detalles:
    ///
    ///   * NO lleva `WhatsappNumber`: el enlace `wa.me` se arma en el endpoint del pedido (F4), no
    ///     en un config que lee cualquiera que abra el catálogo.
    ///   * NO lleva `LogoUrl`/`BannerUrl`: son claves internas de imagen y su URL pública es
    ///     trabajo de F8. Inventar una URL aquí sería publicar una ruta de almacenamiento falsa.
    ///   * SÍ lleva `PaletteId`: la paleta la pinta el storefront, y sin fila de configuración la
    ///     que se devuelve es <see cref="StoreCatalogSettings.DefaultPaletteId"/> — la que el
    ///     catálogo ya usa, para que una tienda recién sincronizada no se vea rota.
    /// </summary>
    public sealed class PublicOrderingConfigDto
    {
        /// <summary>Si la tienda acepta pedidos online. `false` = el storefront no ofrece carrito.</summary>
        public bool Enabled { get; set; }

        /// <summary>Modalidad recogida disponible.</summary>
        public bool PickupEnabled { get; set; }

        /// <summary>Modalidad envío a domicilio disponible.</summary>
        public bool DeliveryEnabled { get; set; }

        /// <summary>Costo de envío, en la moneda del catálogo. Solo aplica con <see cref="DeliveryEnabled"/>.</summary>
        public decimal DeliveryFee { get; set; }

        /// <summary>Importe mínimo del pedido. 0 = sin mínimo.</summary>
        public decimal MinimumOrderAmount { get; set; }

        /// <summary>Horario de atención (texto libre, D16). null = no publicado.</summary>
        public string? BusinessHours { get; set; }

        /// <summary>Zonas de reparto (texto libre, D16). null = todas.</summary>
        public string? DeliveryZones { get; set; }

        /// <summary>
        /// Paleta del catálogo de la tienda. Cuando la tienda no tiene fila de configuración se
        /// devuelve <see cref="StoreCatalogSettings.DefaultPaletteId"/> en vez de una cadena vacía:
        /// el storefront siempre tiene algo que pintar.
        /// </summary>
        public string PaletteId { get; set; } = StoreCatalogSettings.DefaultPaletteId;
    }
}