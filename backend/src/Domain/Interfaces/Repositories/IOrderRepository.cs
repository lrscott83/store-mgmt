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
}