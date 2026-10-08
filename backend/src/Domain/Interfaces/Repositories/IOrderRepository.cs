using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.Orders;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Lecturas de los pedidos ONLINE (F2). La escritura es un alta nueva (el POS no escribe aquí,
    /// D14), así que este repositorio no añade comandos de actualización: los handlers de F5 llaman
    /// a `UpdateAsync` del genérico cuando cambian estado o pago.
    /// </summary>
    public interface IOrderRepository : IGenericRepository<Order, Guid>
    {
        /// <summary>
        /// ¿Existe ya ese código en ESTA tienda? Es la comprobación del generador de `Code`: el
        /// índice único `(StoreId, Code)` es la garantía de fondo, esta consulta es la de fondo
        /// limpio para poder REINTENTAR con otro código en vez de devolver 500 por colisión.
        /// </summary>
        Task<bool> CodeExistsAsync(Guid storeId, string code);

        /// <summary>Pedidos de la tienda, del más nuevo al más viejo (F5/F6).</summary>
        Task<IReadOnlyCollection<Order>> GetByStoreIdAsync(Guid storeId);

        /// <summary>
        /// Pedido por su código público DENTRO de la tienda (la consulta que hace la persona por
        /// WhatsApp). null si ese código no existe en esa tienda.
        /// </summary>
        Task<Order?> GetByCodeAsync(Guid storeId, string code);

        /// <summary>
        /// Página de pedidos de UNA tienda con los filtros de la vista de gestión (F5, T1), y el
        /// total FILTRADO para que la vista sepa cuántas páginas hay.
        ///
        /// Es aditiva a propósito: <see cref="GetByStoreIdAsync"/> sigue siendo la lectura "todos los
        /// pedidos de la tienda" que usa el resto del sistema, y no se toca su firma ni su
        /// comportamiento. Traerlo entero y filtrar/paginar en memoria convertiría cada cambio de
        /// filtro en una lectura completa de la tabla — el histórico de pedidos es lo que crece sin
        /// freno, así que eso no escala ni es reversible.
        ///
        /// <paramref name="skip"/> y <paramref name="take"/> llegan ya calculados por el handler:
        /// la matemática de página es de aplicación, no de un repositorio que además tendría que
        /// inventar un límite de tamaño.
        /// </summary>
        Task<PagedOrders> GetPagedByStoreIdAsync(Guid storeId, OrderListFilter filter, int skip, int take);

        /// <summary>
        /// Un pedido por su id DENTRO de la tienda, con sus líneas y su repartidor (F5, T2: el
        /// detalle). null si ese id no existe en esa tienda — y también si existe en OTRA, que es
        /// justo el aislamiento que el criterio 7 exige: la tienda ajena no existe desde aquí.
        /// </summary>
        Task<Order?> GetByIdWithItemsAsync(Guid storeId, Guid orderId);

        /// <summary>
        /// Agregado de los pedidos de UNA tienda en un rango (F6, T1: las métricas de la vista
        /// "Ventas").
        ///
        /// Existe como método propio y no como un <c>GetByStoreIdAsync</c> filtrado en memoria por
        /// una razón de coste que no es estética: el histórico de pedidos es la tabla que más crece
        /// sin que nada la acote, así que traerla entera para contar en C# convertiría "abrir el
        /// panel de ventas" en una lectura completa de la tabla. Todo el trabajo —`Count`, `Sum` y
        /// los dos `GroupBy`— ocurre en la base.
        ///
        /// Los extremos del rango llegan YA NORMALIZADOS a día completo por el handler, igual que en
        /// <see cref="GetPagedByStoreIdAsync"/>: este repositorio no vuelve a normalizar, para que
        /// el filtro registrado y el filtro ejecutado sean el mismo.
        /// </summary>
        Task<OrderAggregateStats> GetStatsByStoreIdAsync(Guid storeId, OrderStatsFilter filter);
    }

    /// <summary>
    /// Filtros de la vista de pedidos (F5, T1). Todos opcionales: null = "no filtrar por esto".
    ///
    /// Es un tipo aparte y no siete parámetros sueltos porque los filtros viajan entre
    /// capas (handler → repositorio) como un bloque, y añadir uno mañana no obliga a tocar las dos
    /// firmas ni a reordenar las llamadas posicionales que ya existen.
    /// </summary>
    /// <param name="Status">Estado del pedido (D11).</param>
    /// <param name="PaymentStatus">Pago manual (D3/D12).</param>
    /// <param name="DeliveryType">Recogida o envío.</param>
    /// <param name="DriverId">Repartidor asignado. Es el filtro que permite leer "los pedidos de este repartidor".</param>
    /// <param name="From">Extremo INCLUSIVE de <c>Order.Date</c>.</param>
    /// <param name="To">Extremo INCLUSIVE de <c>Order.Date</c>.</param>
    /// <param name="Search">Código público o teléfono. Los dos son lo que una persona dicta o repite.</param>
    public sealed record OrderListFilter(
        OrderStatus? Status = null,
        OrderPaymentStatus? PaymentStatus = null,
        OrderDeliveryType? DeliveryType = null,
        Guid? DriverId = null,
        DateTime? From = null,
        DateTime? To = null,
        string? Search = null);

    /// <summary>
    /// Una página de pedidos con su total filtrado (F5, T1).
    ///
    /// `Items` y `Total` NO se pueden derivar uno del otro: los items vienen paginados y el total
    /// es de toda la tienda. Devolverlos juntos evita la segunda consulta de `COUNT` en el
    /// repositorio y, sobre todo, evita que la vista los calcule con un `.Count` de la página.
    /// </summary>
    public sealed record PagedOrders(IReadOnlyCollection<Order> Items, int Total);

    /// <summary>
    /// Filtros de las MÉTRICAS (F6, T1). Todos opcionales: null = "no filtrar por esto".
    ///
    /// Es un tipo APARTE de <see cref="OrderListFilter"/> a propósito, y no un recorte del otro:
    /// <see cref="OrderListFilter"/> lleva <c>DriverId</c> y <c>Search</c>, que son del LISTADO
    /// (F5), y el endpoint de métricas (F6, T2) no los expone — no tiene selector de repartidor ni
    /// barra de búsqueda. Reutilizarlo dejaría en la firma del agregado dos filtros que nadie
    /// puede activar desde la URL, que es exactamente la forma de que uno acabe filtrando sin que
    /// nadie lo pidiera.
    /// </summary>
    /// <param name="Status">Estado del pedido (D11). Aplazado al desglose: con él, `TotalSales` solo mira ese estado.</param>
    /// <param name="PaymentStatus">Pago manual (D3/D12).</param>
    /// <param name="DeliveryType">Recogida o envío.</param>
    /// <param name="From">Extremo INCLUSIVE de <c>Order.Date</c>, ya normalizado a inicio de día.</param>
    /// <param name="To">Extremo INCLUSIVE de <c>Order.Date</c>, ya normalizado al último tick del día.</param>
    public sealed record OrderStatsFilter(
        OrderStatus? Status = null,
        OrderPaymentStatus? PaymentStatus = null,
        OrderDeliveryType? DeliveryType = null,
        DateTime? From = null,
        DateTime? To = null);

    /// <summary>
    /// El agregado que devuelve <see cref="IOrderRepository.GetStatsByStoreIdAsync"/> (F6, T1), y
    /// el que el handler convierte en <c>OnlineOrderStatsDto</c>.
    ///
    /// Trae <see cref="NonCancelledCount"/> aunque el handler solo lo use para dividir, y esa es la
    /// razón de que exista: <c>TotalSales</c> excluye cancelados, así que sin el denominador
    /// correcto el ticket medio saldría mal, y con el denominador a la vista la regla es
    /// verificable desde fuera (si <c>AverageTicket != TotalSales / OrdersCount</c>, hay
    /// cancelados). También es la guarda contra la división por cero.
    ///
    /// Propiedades con nombre y NO constructor posicional: son diez valores de los que cinco son
    /// números y dos son importes, y en una lista posicional conmutar dos `int` no deja ni un error
    /// de compilación — es el orden de declaración el único que lo detecta.
    ///
    /// <see cref="ByStatus"/> y <see cref="ByDeliveryType"/> traen SOLO los valores presentes en el
    /// rango. Rellenar los que faltan con 0 es del handler, que es quien conoce la lista completa
    /// de la D11 y el orden del enum.
    /// </summary>
    public sealed record OrderAggregateStats
    {
        /// <summary>Pedidos del rango, cancelados incluidos.</summary>
        public int OrdersCount { get; init; }

        /// <summary>Pedidos del rango excluyendo <see cref="OrderStatus.Cancelled"/>.</summary>
        public int NonCancelledCount { get; init; }

        /// <summary>Suma de <c>Order.Total</c> de los no cancelados.</summary>
        public decimal TotalSales { get; init; }

        /// <summary>No cancelados con pago <see cref="OrderPaymentStatus.Paid"/>.</summary>
        public int PaidCount { get; init; }

        /// <summary>Suma de sus <c>Order.Total</c>.</summary>
        public decimal PaidAmount { get; init; }

        /// <summary>No cancelados con pago <see cref="OrderPaymentStatus.Pending"/>.</summary>
        public int PendingCount { get; init; }

        /// <summary>Suma de sus <c>Order.Total</c>.</summary>
        public decimal PendingAmount { get; init; }

        /// <summary>
        /// Moneda de los pedidos del rango: la del no cancelado MÁS RECIENTE. Con desempate por id
        /// para que dos pedidos del mismo instante no dejen la moneda al azar. Si no hay ningún no
        /// cancelado, el default del dominio, <see cref="Currency.CUP"/> — el mismo valor con el
        /// que nace <c>Order.Currency</c> y el primero del enum.
        /// </summary>
        public Currency Currency { get; init; } = Currency.CUP;

        /// <summary>Conteo por estado. Solo los estados presentes. Suma <see cref="OrdersCount"/>.</summary>
        public IReadOnlyDictionary<OrderStatus, int> ByStatus { get; init; }
            = new Dictionary<OrderStatus, int>();

        /// <summary>Conteo por modalidad. Solo las presentes. Suma <see cref="OrdersCount"/>.</summary>
        public IReadOnlyDictionary<OrderDeliveryType, int> ByDeliveryType { get; init; }
            = new Dictionary<OrderDeliveryType, int>();
    }
}