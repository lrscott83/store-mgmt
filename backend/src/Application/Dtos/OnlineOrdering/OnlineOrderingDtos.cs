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
        /// <summary>
        /// Imágenes del carrusel de la cabecera, en el orden que eligió el dueño. VACÍA si la tienda no
        /// tiene carrusel: el storefront solo lo pinta si hay alguna, así que con ninguna la página
        /// funciona exactamente igual que hoy.
        ///
        /// URLs PÚBLICAS del endpoint de media, nunca claves: este config lo lee cualquiera que abra el
        /// catálogo y una clave cruda filtraría la estructura del almacenamiento en disco.
        /// </summary>
        public IReadOnlyList<PublicShowcaseImageDto> CarouselImages { get; set; } = [];

        /// <summary>
        /// Imágenes del día (destacadas que el dueño cambia a mano), en el orden que eligió. VACÍA si
        /// no hay ninguna. Independientes del carrusel: puede haber los dos, uno o ninguno.
        /// </summary>
        public IReadOnlyList<PublicShowcaseImageDto> DailyImages { get; set; } = [];
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
    /// Una imagen del SHOWCASE tal como la ve el cliente del catálogo público: URL y pie de foto. Dos
    /// campos y ni uno más.
    ///
    /// Deliberadamente NO lleva la clave: es una ruta interna de almacenamiento y este DTO lo lee
    /// cualquiera que abra el catálogo. La URL la compone el config anónimo con el slug de la tienda
    /// (`CatalogPublicUrls.Media`), que es el único que sabe resolverlo, y la sirve el MISMO endpoint
    /// público de media que las imágenes de producto y las de marca.
    /// </summary>
    public sealed class PublicShowcaseImageDto
    {
        /// <summary>URL pública de la imagen.</summary>
        public string Url { get; set; } = string.Empty;

        /// <summary>Pie de foto opcional. null = sin pie.</summary>
        public string? Caption { get; set; }
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

    // --- Lecturas de gestión de pedidos (F5, vista "Pedidos") ---------------------------------

    /// <summary>
    /// Una fila de la tabla de pedidos de la tienda del contexto (F5). Es lo mínimo que la tabla
    /// pinta y lo máximo que se puede leer SIN cargar las líneas: el listado trae pedidos completos
    /// en una sola consulta, y las líneas solo se piden al abrir uno (T1 frente a T2).
    ///
    /// NO lleva `StoreId`: la lista es siempre de la tienda de la sesión, así que publicarlo sería
    /// redundante y abriría la puerta a que el frontend lo relajara como filtro.
    /// </summary>
    public sealed class OnlineOrderListItemDto
    {
        /// <summary>Identificador del pedido. Es lo que llevan las acciones de estado/pago/repartidor.</summary>
        public Guid Id { get; set; }

        /// <summary>Código público dictado por WhatsApp. null en ventas del POS.</summary>
        public string? Code { get; set; }

        /// <summary>Nombre de quien pide. null en ventas del POS.</summary>
        public string? CustomerName { get; set; }

        /// <summary>Teléfono de quien pide. Es lo que la búsqueda (`search`) contrasta junto al código.</summary>
        public string? CustomerPhone { get; set; }

        /// <summary>Recogida o envío a domicilio.</summary>
        public OrderDeliveryType DeliveryType { get; set; }

        /// <summary>Importe del pedido (líneas + costo de envío), en <see cref="Currency"/>.</summary>
        public decimal Total { get; set; }

        /// <summary>Moneda de <see cref="Total"/> y de los precios de las líneas. La pone el catálogo.</summary>
        public Currency Currency { get; set; }

        /// <summary>Estado del pedido (D11).</summary>
        public OrderStatus Status { get; set; }

        /// <summary>Pago manual (D3/D12). Independiente de <see cref="Status"/>.</summary>
        public OrderPaymentStatus PaymentStatus { get; set; }

        /// <summary>Repartidor asignado. null mientras nadie lo asigne (F7).</summary>
        public Guid? DriverId { get; set; }

        /// <summary>
        /// Nombre del repartidor YA resuelto. Viene desnormalizado a propósito: la tabla lo pinta
        /// y así la vista no necesita una segunda consulta de repartidores por cada fila.
        /// null si no hay repartidor asignado.
        /// </summary>
        public string? DriverName { get; set; }

        /// <summary>Momento del pedido. Es la columna de orden del listado (del más nuevo al más viejo).</summary>
        public DateTime Date { get; set; }
    }

    /// <summary>
    /// Una línea del detalle de un pedido (F5, T2). Es el SNAPSHOT que el servidor resolvió al
    /// crear el pedido, no una lectura del catálogo: cambiar el precio de un producto después NO
    /// reescribe el pedido ya hecho.
    /// </summary>
    public sealed class OnlineOrderLineDto
    {
        /// <summary>Producto comprado. Se mantiene aunque el producto después se dé de baja.</summary>
        public Guid ProductId { get; set; }

        /// <summary>Nombre del producto en el momento del pedido.</summary>
        public string Name { get; set; } = string.Empty;

        public int Quantity { get; set; }

        /// <summary>Precio UNITARIO en el momento del pedido.</summary>
        public decimal Price { get; set; }

        /// <summary>Moneda de <see cref="Price"/>.</summary>
        public Currency Currency { get; set; }

        /// <summary>
        /// Importe de la línea (`Quantity * Price`). Viaja calculado para que la vista no tenga que
        /// repetir la multiplicación con una moneda distinta a la que espera.
        /// </summary>
        public decimal LineTotal { get; set; }
    }

    /// <summary>
    /// Detalle de UN pedido (F5, T2). Lleva TODO lo de <see cref="OnlineOrderListItemDto"/> y además
    /// las líneas, el domicilio y las notas: es el pedido entero, que es lo que se abre para
    /// confirmar, imprimir o auditar.
    /// </summary>
    public sealed class OnlineOrderDetailDto
    {
        public Guid Id { get; set; }

        public string? Code { get; set; }

        public string? CustomerName { get; set; }

        public string? CustomerPhone { get; set; }

        public OrderDeliveryType DeliveryType { get; set; }

        /// <summary>Importe del pedido (líneas + costo de envío), en <see cref="Currency"/>.</summary>
        public decimal Total { get; set; }

        public Currency Currency { get; set; }

        public OrderStatus Status { get; set; }

        public OrderPaymentStatus PaymentStatus { get; set; }

        public Guid? DriverId { get; set; }

        public string? DriverName { get; set; }

        public DateTime Date { get; set; }

        /// <summary>Domicilio. Obligatorio solo con <see cref="OrderDeliveryType.Delivery"/>.</summary>
        public string? DeliveryAddress { get; set; }

        /// <summary>Notas que dejó quien pidió.</summary>
        public string? Notes { get; set; }

        /// <summary>
        /// Líneas del pedido EN EL ORDEN EN QUE SE PIDIERON (`OrderItem.OrderIndex`), no en el
        /// orden arbitrario que devuelva la base: el orden de la lista es parte de lo que el cliente
        /// escribió y de lo que se confirma leyendo.
        /// </summary>
        public List<OnlineOrderLineDto> Lines { get; set; } = new();
    }

    /// <summary>
    /// Página de pedidos de la tienda del contexto (F5, T1). Mismo contrato que la página del
    /// catálogo público: `Items` ya viene paginada y `Total` es el TOTAL FILTRADO, no el de la
    /// tienda — es lo que la vista necesita para saber cuántas páginas hay.
    /// </summary>
    public sealed class OnlineOrderPageDto
    {
        public List<OnlineOrderListItemDto> Items { get; set; } = new();

        /// <summary>Cuántos pedidos cumplen los filtros, en toda la tienda (no solo en esta página).</summary>
        public int Total { get; set; }

        /// <summary>Página devuelta, ya normalizada (siempre ≥ 1).</summary>
        public int Page { get; set; }

        /// <summary>Tamaño de página realmente aplicado, ya acotado por el máximo del handler.</summary>
        public int PageSize { get; set; }
    }

    // --- Métricas de la vista "Ventas" (F6) --------------------------------------------

    /// <summary>
    /// Una fila del desglose por estado (F6). Es un tipo y no un
    /// <c>Dictionary&lt;OrderStatus, int&gt;</c> por dos razones concretas:
    ///
    ///   * El cliente necesita un EJE FIJO. Un diccionario solo trae los estados presentes, así que
    ///     la tarjeta cambiaría de altura y saltaría de sitio en cuanto cambiara el filtro. Con la
    ///     lista completa —incluidos los ceros— el gráfico es el mismo siempre.
    ///   * El orden es el del enum (el handler lo impone), no el que devuelva la base.
    ///
    /// No son claves porque un `enum` serializado como clave de diccionario depende de que haya un
    /// `JsonStringEnumConverter` registrado para CLAVES, y el proyecto no lo tiene: las claves
    /// saldrían numéricas mientras el resto de los enums del contrato salen por su valor. Aquí el
    /// enum es un VALOR de propiedad, igual que <see cref="OnlineOrderListItemDto.Status"/>, y
    /// entonces se serializa exactamente igual que el resto de la feature.
    /// </summary>
    public sealed class OnlineOrderStatusCountDto
    {
        public OrderStatus Status { get; set; }

        /// <summary>Pedidos del rango en ese estado. Incluye los cancelados.</summary>
        public int Count { get; set; }
    }

    /// <inheritdoc cref="OnlineOrderStatusCountDto"/>
    public sealed class OnlineOrderDeliveryTypeCountDto
    {
        public OrderDeliveryType DeliveryType { get; set; }

        /// <summary>Pedidos del rango con esa modalidad.</summary>
        public int Count { get; set; }
    }

    /// <summary>
    /// Métricas agregadas de los pedidos online de la tienda del contexto en un rango (F6, vista
    /// "Ventas"). Se calculan EN LA BASE: la vista pinta números, no necesita las filas.
    ///
    /// <para><b>LA REGLA</b>: <see cref="TotalSales"/> EXCLUYE los pedidos
    /// <see cref="OrderStatus.Cancelled"/>, y <see cref="AverageTicket"/> divide por
    /// <see cref="NonCancelledCount"/> —el mismo conjunto excluido. <see cref="OrdersCount"/> NO
    /// los excluye, porque "cuántos pedidos entraron" y "cuánto se vendió" son preguntas distintas
    /// y mezclarlas diría que se vendieron pedidos que el dueño canceló. El cancelado sigue
    /// visible en <see cref="ByStatus"/>, así que no se pierde ningún dato.
    ///
    /// <see cref="PaidCount"/>/<see cref="PaidAmount"/> y
    /// <see cref="PendingCount"/>/<see cref="PendingAmount"/> usan el MISMO conjunto excluido, y
    /// los RECUENTOS y los IMPORTES también van de la mano: cada par describe exactamente el mismo
    /// conjunto de pedidos, para que <c>PaidAmount / PaidCount</c> sea el ticket medio de lo
    /// pagado. Un cancelado no es venta ni es deuda: si sumara, el panel pediría un cobro que no
    /// existe.
    ///
    /// Los desgloses CUENTAN cancelados a propósito —es el único sitio donde se ven— y por eso
    /// ambos suman <see cref="OrdersCount"/>.</para>
    ///
    /// <para><see cref="Currency"/> sale de los PEDIDOS del rango (A3 eliminada: no hay moneda
    /// configurable). Es la del pedido no cancelado más reciente y, sin ninguno, el default del
    /// dominio, <see cref="Domain.Common.Enums.Currency.CUP"/>. No es <c>Currency?</c> a
    /// propósito: el cliente siempre formatea importes y un <c>null</c> lo obligaría a ramificar en
    /// cada tarjeta.</para>
    /// </summary>
    public sealed class OnlineOrderStatsDto
    {
        /// <summary>
        /// Pedidos del rango, TODOS. Suma lo de <see cref="ByStatus"/> y lo de
        /// <see cref="ByDeliveryType"/>, e incluye los cancelados.
        /// </summary>
        public int OrdersCount { get; set; }

        /// <summary>
        /// Pedidos del rango EXCEPTO cancelados: el denominador de <see cref="AverageTicket"/> y el
        /// conjunto del que salen <see cref="TotalSales"/> y los importes de pago. Viaja en el DTO
        /// porque es lo que hace verificable la regla de exclusión sin tener que conocer la
        /// regla: si <c>AverageTicket != TotalSales / OrdersCount</c>, hay cancelados.
        /// </summary>
        public int NonCancelledCount { get; set; }

        /// <summary>Suma de <c>Order.Total</c> de los pedidos NO cancelados, en <see cref="Currency"/>.</summary>
        public decimal TotalSales { get; set; }

        /// <summary>
        /// <c>TotalSales / NonCancelledCount</c>, redondeado a dos decimales, o 0 si no hay pedidos
        /// no cancelados. Se divide por los NO cancelados a propósito: dividir por
        /// <see cref="OrdersCount"/> bajaría el ticket medio en cuanto hubiera un cancelado, y es el
        /// número más grande de la vista.
        /// </summary>
        public decimal AverageTicket { get; set; }

        /// <summary>Pedidos NO cancelados con pago <see cref="OrderPaymentStatus.Paid"/>.</summary>
        public int PaidCount { get; set; }

        /// <summary>Suma de sus <c>Total</c>. El mismo conjunto que <see cref="PaidCount"/>.</summary>
        public decimal PaidAmount { get; set; }

        /// <summary>Pedidos NO cancelados con pago <see cref="OrderPaymentStatus.Pending"/>.</summary>
        public int PendingCount { get; set; }

        /// <summary>Suma de sus <c>Total</c>. El mismo conjunto que <see cref="PendingCount"/>.</summary>
        public decimal PendingAmount { get; set; }

        /// <summary>
        /// Conteo por estado, en el ORDEN del enum y con un 0 por cada estado sin pedidos del
        /// rango. Suma <see cref="OrdersCount"/>.
        /// </summary>
        public List<OnlineOrderStatusCountDto> ByStatus { get; set; } = new();

        /// <summary>
        /// Conteo por modalidad, en el ORDEN del enum y con un 0 por cada modalidad sin pedidos del
        /// rango. Suma <see cref="OrdersCount"/>.
        /// </summary>
        public List<OnlineOrderDeliveryTypeCountDto> ByDeliveryType { get; set; } = new();

        /// <summary>Moneda de todos los importes de esta respuesta.</summary>
        public Currency Currency { get; set; }
    }
}
