using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductRepository : GenericRepository<Product, Guid>, IProductRepository
    {
        private readonly DbSet<Product> _products;
        public ProductRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _products = dbContext.Set<Product>();
        }

        public async Task<IEnumerable<Product>> GetAvailableToSaleProductsByCategoryIdAsync(Guid categoryId)
        {
            return await _products
                .Where(product => product.IsActive && product.AvailableToSale
                    && product.CategoryId == categoryId && product.Category.IsActive)
                .OrderBy(product => product.Order)
                .ToListAsync();
        }

        public async Task<int> GetMaxOrderAsync()
        {
            return await _products.MaxAsync(product => product.Order);
        }

        public async Task<IList<Product>> GetProductsByCategoryIdAsync(Guid categoryId)
        {
            return await _products
                .Where(product => product.CategoryId == categoryId)
                .OrderBy(product => product.Order)
                .ToListAsync();
        }

        public async Task<IEnumerable<Product>> GetActiveProductsIncludingCategoryByStoreIdAsync(Guid storeId)
        {
            return await _products
                .Where(product => product.IsActive && product.Category.StoreId == storeId)
                .OrderBy(product => product.Category.Order).ThenBy(product => product.Order)
                .Include(product => product.Category)
                .ToListAsync();
        }

        public async Task<bool> IsUniqueNameAsync(string name)
        {
            return await Task.FromResult(_products.All(t => t.Name != name));
        }

        public async Task<int> GetMaxOrderByCategoryIdAsync(Guid categoryId)
        {
            return (await _products
                .Where(product => product.CategoryId == categoryId)
                .MaxAsync(product => product.Order)) + 1;
        }

        public async Task<IEnumerable<Product>> GetAvailableProductsByCategoryIdAsync(Guid categoryId)
        {
            return await _products
               .Where(product => product.IsActive && product.CategoryId == categoryId && product.Category.IsActive)
               .OrderBy(product => product.Order)
               .ToListAsync();
        }

        public async Task<IList<Product>> GetProductsForCatalogSyncAsync(Guid storeId)
        {
            return await _products
                .Where(product => product.Category.StoreId == storeId)
                .Include(product => product.Category)
                .Include(product => product.Images)
                .OrderBy(product => product.Category.Order)
                .ThenBy(product => product.Order)
                .ToListAsync();
        }

        public async Task<bool> HasAnyAvailableToSaleProductByStoreId(Guid id)
        {
            return await _products.AnyAsync(product => product.IsActive && product.AvailableToSale
                && product.Category.IsActive);

        }

        // --- Lecturas del catálogo público (publicación directa sobre esta tabla, decisión del
        // Owner 2026-09-28): activos y en venta, de categorías activas con slug público. ---

        public async Task<IList<Product>> GetPublishedByStoreIdAsync(Guid storeId, Guid? categoryId, string? search)
        {
            IQueryable<Product> query = _products
                .IgnoreQueryFilters()
                .Where(product => product.Category.StoreId == storeId
                    && product.IsActive && product.AvailableToSale
                    && product.Category.IsActive
                    && product.Category.Slug != null)
                .Include(product => product.Images)
                .Include(product => product.Category);

            if (categoryId.HasValue)
                query = query.Where(product => product.CategoryId == categoryId.Value);

            if (!string.IsNullOrWhiteSpace(search))
            {
                string term = search.Trim().ToLowerInvariant();
                query = query.Where(product => product.Name.ToLower().Contains(term));
            }

            return await query
                .OrderBy(product => product.Category.Order)
                .ThenBy(product => product.Order)
                .ThenBy(product => product.Name)
                .ToListAsync();
        }

        public async Task<Product?> GetPublishedByIdAsync(Guid storeId, Guid productId)
        {
            return await _products
                .IgnoreQueryFilters()
                .Where(product => product.Category.StoreId == storeId
                    && product.Id == productId
                    && product.IsActive && product.AvailableToSale
                    && product.Category.IsActive
                    && product.Category.Slug != null)
                .Include(product => product.Images)
                .Include(product => product.Category)
                .FirstOrDefaultAsync();
        }

        /// <summary>
        /// Los mismos productos publicados que devuelve <see cref="GetPublishedByStoreIdAsync"/>,
        /// filtrados por un conjunto de ids y en UNA consulta. Existe para el carrito del pedido
        /// online (F2): recorrer `GetPublishedByIdAsync` por línea del carrito es un N+1 —N viajes
        /// a la base para N filas— y además cada viaje pagaría el `Include` de imágenes y categoría.
        ///
        /// MISMAS puertas de publicación, sin excepción: si un producto no está publicado, esta
        /// consulta simplemente no lo devuelve, así que el handler del pedido ve el faltante y
        /// rechaza el pedido en vez de aceptarlo con un precio que ya no existe.
        /// </summary>
        public async Task<IList<Product>> GetPublishedByIdsAsync(Guid storeId, IReadOnlyCollection<Guid> ids)
        {
            if (ids.Count == 0)
                return [];

            return await _products
                .IgnoreQueryFilters()
                .Where(product => ids.Contains(product.Id)
                    && product.Category.StoreId == storeId
                    && product.IsActive && product.AvailableToSale
                    && product.Category.IsActive
                    && product.Category.Slug != null)
                .Include(product => product.Category)
                .ToListAsync();
        }
    }
}
