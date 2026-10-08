using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class OrderRepository : GenericRepository<Order, Guid>, IOrderRepository
    {
        private readonly DbSet<Order> _orders;
        public OrderRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _orders = dbContext.Set<Order>();
        }

        /// <summary>
        /// `IgnoreQueryFilters` a propósito: el filtro global es por TENANT (`TenantId == contexto`),
        /// no por tienda. Un pedido de otra tienda del mismo tenant tiene que contar como ocupado
        /// para el generador de códigos, o dos tiendas con el mismo código romperían el índice
        /// único `(StoreId, Code)` en el `SaveChanges` en vez de reintentar con otro código.
        /// </summary>
        public async Task<bool> CodeExistsAsync(Guid storeId, string code)
            => await _orders
                .IgnoreQueryFilters()
                .AnyAsync(o => o.StoreId == storeId && o.Code == code);

        public async Task<IReadOnlyCollection<Order>> GetByStoreIdAsync(Guid storeId)
            => await _orders
                .Where(o => o.StoreId == storeId)
                .OrderByDescending(o => o.Date)
                .ToListAsync();

        /// <summary>
        /// Con sus líneas: el detalle de un pedido sin los items es un pedido que no se puede
        /// mostrar ni auditar. El filtro global por tenant sigue activo a propósito —la búsqueda
        /// por código es de una sesión con tienda, no pública— y por eso `CodeExistsAsync` es la
        /// que necesita `IgnoreQueryFilters` (y no esta).
        /// </summary>
        public async Task<Order?> GetByCodeAsync(Guid storeId, string code)
            => await _orders
                .Where(o => o.StoreId == storeId && o.Code == code)
                .Include(o => o.OrderItems)
                .Include(o => o.Driver)
                .FirstOrDefaultAsync();

        /// <summary>
        /// Lectura PÚBLICA del pedido por código: salta el filtro global por tenant porque una
        /// petición ANÓNIMA no tiene tenant en el contexto (ver la nota del handler). El filtro no
        /// es lo único que acota el resultado: sigue filtrando por `StoreId` y por código.
        ///
        /// `IgnoreQueryFilters` alcanza también a las LÍNEAS, y `OrderItem` tiene su propio filtro
        /// por tenant: sin el bypass del conjunto, el pedido volvería sin items y el DTO público
        /// publicaría un carrito vacío.
        ///
        /// No incluye `Driver`: el repartidor es interno de la tienda (F7) y el DTO público no lo
        /// publica.
        /// </summary>
        public async Task<Order?> GetPublicByCodeAsync(Guid storeId, string code)
            => await _orders
                .IgnoreQueryFilters()
                .Where(o => o.StoreId == storeId && o.Code == code)
                .Include(o => o.OrderItems)
                .FirstOrDefaultAsync();

        /// <summary>
        /// Filtra POR LA BASE y no en memoria (F5, T1). Traer la tabla entera y descartar en C# lo
        /// que no cumple el filtro convertiría "abrir la vista de pedidos con un filtro puesto" en
        /// una lectura completa del histórico, y el histórico de pedidos es la tabla que más crece
        /// sin que nada la acote. Cada <c>Where</c> es condicional para que un filtro sin usar NO
        /// escriba un predicado espurio en el SQL.
        ///
        /// El <c>storeId</c> se aplica primero y sin condiciones: es el aislamiento entre tiendas
        /// (criterio 7), y que no dependa de ningún otro filtro significa que ni un `skip`/`take`
        /// descuidado ni un filtro mal formado pueden dejar ver un pedido de otra tienda.
        /// </summary>
        public async Task<PagedOrders> GetPagedByStoreIdAsync(Guid storeId, OrderListFilter filter, int skip, int take)
        {
            IQueryable<Order> query = _orders.Where(o => o.StoreId == storeId);

            if (filter.Status is { } status)
                query = query.Where(o => o.Status == status);

            if (filter.PaymentStatus is { } paymentStatus)
                query = query.Where(o => o.PaymentStatus == paymentStatus);

            if (filter.DeliveryType is { } deliveryType)
                query = query.Where(o => o.DeliveryType == deliveryType);

            if (filter.DriverId is { } driverId)
                query = query.Where(o => o.DriverId == driverId);

            // Ambos extremos son INCLUSIVOS y llegan YA NORMALIZADOS a día completo por el handler
            // (`NormalizeFrom`/`NormalizeTo`): `To` es el último tick del día que se eligió, así que
            // "hoy" y "esta semana" —los dos rangos que usa la vista— incluyen ese día entero. Este
            // repositorio NO vuelve a normalizar: si lo hiciera, el filtro registrado y el filtro
            // ejecutado dejarían de ser el mismo, que es justo lo que el test del handler comprueba.
            if (filter.From is { } from)
                query = query.Where(o => o.Date >= from);

            if (filter.To is { } to)
                query = query.Where(o => o.Date <= to);

            if (!string.IsNullOrWhiteSpace(filter.Search))
            {
                string term = filter.Search.Trim();
                query = query.Where(o =>
                    (o.Code != null && o.Code.Contains(term)) ||
                    (o.CustomerPhone != null && o.CustomerPhone.Contains(term)));
            }

            // `Total` se cuenta ANTES del `Skip`/`Take` sobre la misma consulta ya filtrada: es el
            // número de pedidos que cumplen los filtros en toda la tienda, que es lo que la vista
            // necesita para pintar "página 3 de 12".
            //
            // El `Include` del repartidor va AQUÍ y no en la consulta de arriba a propósito: cargarlo
            // también en el `Count` añadiría su `LEFT JOIN` a la consulta que más filas cuenta sin
            // usar ninguna columna suya.
            int total = await query.CountAsync();

            // El repartidor se carga para el LISTADO porque el DTO lleva su nombre, y porque el
            // contexto es `NoTracking` por omisión (`ApplicationDbContext`) sin ningún `AutoInclude`
            // en el modelo: sin este `Include`, `order.Driver` llega null y TODOS los pedidos salen
            // "sin repartidor" aunque su `DriverId` venga puesto. El nombre no se puede rellenar
            // después —`DriverId` es solo la llave— y el mapeo (`order.Driver?.Name`) no lo inventa.
            List<Order> items = await query
                .Include(o => o.Driver)
                .OrderByDescending(o => o.Date)
                .ThenByDescending(o => o.Id)
                .Skip(skip)
                .Take(take)
                .ToListAsync();

            return new PagedOrders(items, total);
        }

        /// <summary>
        /// Detalle de un pedido de ESTA tienda (F5, T2). El `storeId` va en el MISMO predicado que el
        /// id a propósito: pedir el pedido primero y comprobar la tienda después en memoria dejaría
        /// una ventana en la que el pedido ajeno ya está cargado, y "lo borro si no es mío" es
        /// exactamente el patrón que produce una fuga entre tiendas.
        /// </summary>
        public async Task<Order?> GetByIdWithItemsAsync(Guid storeId, Guid orderId)
            => await _orders
                .Where(o => o.StoreId == storeId && o.Id == orderId)
                .Include(o => o.OrderItems)
                .Include(o => o.Driver)
                .FirstOrDefaultAsync();
    }
}
