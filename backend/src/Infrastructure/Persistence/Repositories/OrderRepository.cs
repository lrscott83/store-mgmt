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
    }
}
