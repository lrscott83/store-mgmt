using Domain.Common.Enums;
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
    ///   * SÍ lleva `LogoUrl`/`BannerUrl` (F8) y NUNCA `LogoKey`/`BannerKey`: el storefront necesita
    ///     la URL para pintar el <c>&lt;img&gt;</c>, y publicar la clave cruda filtraría una ruta de
    ///     almacenamiento interno a cualquiera que abra el catálogo. Las URL son del endpoint público
    ///     de media, que es el único que puede resolverlas con el slug.
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
        /// URL PÚBLICA del logo (F8), construida con el slug de la tienda y servida por el endpoint
        /// de media del catálogo. null = la tienda no tiene logo.
        ///
        /// Nunca es una ruta del servidor: sale de <c>CatalogPublicUrls.Media</c> como la de
        /// cualquier imagen del catálogo.
        /// </summary>
        public string? LogoUrl { get; set; }

        /// <summary>URL PÚBLICA del banner (F8). null = la tienda no tiene banner.</summary>
        public string? BannerUrl { get; set; }

        /// <summary>
        /// Paleta del catálogo de la tienda. Cuando la tienda no tiene fila de configuración se
        /// devuelve <see cref="StoreCatalogSettings.DefaultPaletteId"/> en vez de una cadena vacía:
        /// el storefront siempre tiene algo que pintar.
        /// </summary>
        public string PaletteId { get; set; } = StoreCatalogSettings.DefaultPaletteId;
    }

    /// <summary>
    /// Estado de UN pedido, tal como lo ve quien lo pidió (F3). Anónimo: lo lee el storefront con el
    /// código y el teléfono, sin sesión y sin cuenta de cliente (D4).
    ///
    /// Está ACOTADO A PROPÓSITO. Sale lo que hace falta para responder "¿ya está? ¿lo pagado? ¿a
    /// domicilio?": estado, pago, modalidad, total, moneda y las líneas. NO sale ni el nombre ni el
    /// teléfono del cliente (ya los conoce quien pregunta y no aportan nada), ni la DIRECCIÓN ni las
    /// NOTAS (datos personales que el lector anónimo no ha acreditado más allá del teléfono), ni el
    /// repartidor, ni los ids internos. Cada campo nuevo aquí es un dato del pedido que un anónimo
    /// puede leer probando códigos.
    /// </summary>
    public sealed class PublicOrderStatusDto
    {
        /// <summary>Código del pedido, tal como se guarda (mayúsculas).</summary>
        public string Code { get; set; } = string.Empty;

        /// <summary>Estado del pedido (D11). El POS nunca lo mueve.</summary>
        public OrderStatus Status { get; set; }

        /// <summary>Pago manual (D3/D12): pendiente hasta que la tienda lo marque pagado en efectivo.</summary>
        public OrderPaymentStatus PaymentStatus { get; set; }

        /// <summary>Recogida o domicilio.</summary>
        public OrderDeliveryType DeliveryType { get; set; }

        /// <summary>Total YA calculado por el servidor, con el envío dentro si lo hubo.</summary>
        public decimal Total { get; set; }

        /// <summary>Moneda del catálogo (A3 eliminó la moneda configurable de pedidos).</summary>
        public Currency Currency { get; set; }

        /// <summary>Líneas con el SNAPSHOT histórico: nombre, cantidad y precio del momento del pedido.</summary>
        public List<PublicOrderItemDto> Items { get; set; } = [];
    }

    /// <summary>
    /// Una línea del pedido en la consulta pública. Tres campos y ni uno más: sin `ProductId`
    /// (identificador interno), sin moneda (la del pedido vale para todas) y sin datos del producto
    /// que el catálogo público ya publica por su cuenta.
    /// </summary>
    public sealed class PublicOrderItemDto
    {
        /// <summary>Nombre del producto tal como se guardó al pedir.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Cantidad pedida.</summary>
        public int Quantity { get; set; }

        /// <summary>Precio unitario del snapshot, no el del catálogo de hoy.</summary>
        public decimal Price { get; set; }
    }
}