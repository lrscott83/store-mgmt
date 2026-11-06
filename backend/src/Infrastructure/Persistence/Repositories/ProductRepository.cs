using Domain.Common.Enums;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductRepository : GenericRepository<Product, Guid>, IProductRepository
    {
        private readonly DbSet<Product> _products;

        /// <summary>
        /// Memoria del modo de precio YA resuelto, por tienda. Un request público pregunta el modo
        /// una vez para el conteo, otra para la página y otra para etiquetar los DTOs: sin esto
        /// serían tres `SELECT` del mismo escalar por visita anónima. El repositorio es scoped, así
        /// que el ámbito natural de la memoria ES la petición.
        /// </summary>
        private Guid? _priceModeStoreId;
        private CatalogPriceMode? _priceMode;

        public ProductRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _products = dbContext.Set<Product>();
        }

        public async Task<bool> BelongsToStoreAsync(Guid storeId, Guid productId)
            => await _products.AnyAsync(p => p.Id == productId && p.Category.StoreId == storeId);

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
                .Where(product => product.IsActive && product.Category.IsActive
                    && product.Category.StoreId == storeId)
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
                .Include(product => product.WholesaleTiers)
                .OrderBy(product => product.Category.Order)
                .ThenBy(product => product.Order)
                .ToListAsync();
        }

        public async Task<CatalogProductCounts> CountForCatalogStatusAsync(Guid storeId)
        {
            // Tres `COUNT` en SQL: sin `Include`, sin materializar una sola fila. El status solo
            // muestra números; cargar el grafo entero para contarlo era trabajo tirado.
            IQueryable<Product> query = _products.Where(product => product.Category.StoreId == storeId);

            int total = await query.CountAsync();
            int published = await query.CountAsync(product => product.IsActive && product.AvailableToSale);
            int withoutMainImage = await query.CountAsync(
                product => product.Image == null || product.Image == string.Empty);

            return new CatalogProductCounts(total, published, withoutMainImage);
        }

        public async Task<bool> HasAnyAvailableToSaleProductByStoreId(Guid id)
        {
            return await _products.AnyAsync(product => product.IsActive && product.AvailableToSale
                && product.Category.IsActive);

        }

        // --- Lecturas del catálogo público (publicación directa sobre esta tabla, decisión del
        // Owner 2026-09-28): activos y en venta, de categorías activas con slug público. ---

        /// <summary>
        /// Modo de precio publicado por la tienda. Sin fila de configuración no hay opinión: se
        /// publica por unidad, que es lo que el catálogo hacía antes de que existiera el modo.
        ///
        /// `IgnoreQueryFilters` es obligatorio, igual que en `GetPublishedBy*`: una petición
        /// anónima no tiene tenant en el contexto, y `StoreCatalogSettings` tiene filtro global por
        /// tenant, así que la consulta respondería "sin fila" para TODAS las tiendas — un catálogo
        /// mayorista publicado como unidad, sin error ni aviso.
        /// </summary>
        public async Task<CatalogPriceMode> GetPublicPriceModeAsync(Guid storeId,
            CancellationToken cancellationToken = default)
        {
            if (_priceMode.HasValue && _priceModeStoreId == storeId)
                return _priceMode.Value;

            // `FirstOrDefaultAsync` sobre el selector devuelve `0` cuando la tienda no tiene fila:
            // no es un modo válido, y solo `Wholesale` es mayorista, así que se normaliza.
            CatalogPriceMode stored = await _dbContext.Set<StoreCatalogSettings>()
                .IgnoreQueryFilters()
                .Where(settings => settings.StoreId == storeId)
                .Select(settings => settings.PriceMode)
                .FirstOrDefaultAsync(cancellationToken);

            CatalogPriceMode mode = stored == CatalogPriceMode.Wholesale
                ? CatalogPriceMode.Wholesale
                : CatalogPriceMode.Unit;

            _priceModeStoreId = storeId;
            _priceMode = mode;

            return mode;
        }

        /// <summary>
        /// S7: ¿tiene la tienda algún producto con configuración mayorista válida?
        ///
        /// El predicado es EL MISMO que el de la puerta de publicación (`ApplyWholesaleGate`), no una
        /// segunda copia: si el modo mayorista publica exactamente lo que pasa esa condición, el
        /// control que autoriza el modo tiene que medir esa misma condición — una copia divergiría y
        /// dejaría guardar un modo que publica una página vacía.
        ///
        /// `IgnoreQueryFilters` por el mismo motivo que en la lectura pública: la tienda puede ser la
        /// de la RUTA (vista del SuperAdmin) y el filtro global aplicaría el tenant de quien llama.
        /// `Any()` se traduce a `EXISTS`: no se materializa ni un producto.
        /// </summary>
        public async Task<bool> HasWholesalePricedProductsAsync(Guid storeId,
            CancellationToken cancellationToken = default)
            => await ApplyWholesaleGate(
                    _products
                        .IgnoreQueryFilters()
                        .Where(product => product.Category.StoreId == storeId),
                    CatalogPriceMode.Wholesale)
                .AnyAsync(cancellationToken);

        public async Task<IList<Product>> GetPublishedPageAsync(Guid storeId, string? categorySlug, string? search,
            int skip, int take, CancellationToken cancellationToken = default)
        {
            IQueryable<Product> query = ApplyPublishedFilters(
                await PublishedQueryAsync(storeId, cancellationToken), categorySlug, search);

            return await query
                // Los escalones se publican en la tarjeta (mínimo, precio por unidad y por paquete):
                // sin este `Include` el DTO los daría por inexistentes.
                .Include(product => product.WholesaleTiers)
                .OrderBy(product => product.Category.Order)
                .ThenBy(product => product.Order)
                .ThenBy(product => product.Name)
                .Skip(skip)
                .Take(take)
                .ToListAsync(cancellationToken);
        }

        public async Task<int> CountPublishedAsync(Guid storeId, string? categorySlug, string? search,
            CancellationToken cancellationToken = default)
            => await ApplyPublishedFilters(
                    await PublishedQueryAsync(storeId, cancellationToken), categorySlug, search)
                .CountAsync(cancellationToken);

        public async Task<IList<PublishedCategoryCount>> GetPublishedCategoryCountsAsync(Guid storeId,
            CancellationToken cancellationToken = default)
            => await (await PublishedQueryAsync(storeId, cancellationToken))
                .GroupBy(product => new
                {
                    product.CategoryId,
                    product.Category.Name,
                    product.Category.Slug,
                    product.Category.Order
                })
                .Select(group => new PublishedCategoryCount(
                    group.Key.CategoryId,
                    group.Key.Name,
                    group.Key.Slug!,
                    group.Key.Order,
                    group.Count()))
                .ToListAsync(cancellationToken);

        /// <summary>
        /// Universo PUBLICADO: activo, en venta, de categoría activa con slug público, de la tienda,
        /// y con la puerta del modo de precio aplicada.
        /// Trae la categoría (el listado y la cabecera la usan) pero NO la galería: la imagen pública
        /// tiene una sola fuente, `Product.Image` (columna), así que `Include(Images)` era traer filas
        /// que nadie lee.
        /// </summary>
        private async Task<IQueryable<Product>> PublishedQueryAsync(Guid storeId,
            CancellationToken cancellationToken)
        {
            CatalogPriceMode priceMode = await GetPublicPriceModeAsync(storeId, cancellationToken);

            IQueryable<Product> query = _products
                .IgnoreQueryFilters()
                .Include(product => product.Category)
                .Where(product => product.Category.StoreId == storeId
                    && product.IsActive && product.AvailableToSale
                    && product.Category.IsActive
                    && product.Category.Slug != null);

            return ApplyWholesaleGate(query, priceMode);
        }

        /// <summary>
        /// S2: en modo mayorista el catálogo publica EXACTAMENTE lo que la venta mayorista del POS
        /// puede vender, así que un producto sin config válida (activada, con paquete positivo y al
        /// menos un escalón) desaparece — de la lista, del detalle, de la búsqueda y de los conteos
        /// por categoría, porque todos salen de aquí.
        ///
        /// Es un predicado, no un filtro en memoria: `WholesaleTiers.Any()` se traduce a `EXISTS`, y
        /// el `IgnoreQueryFilters` de arriba alcanza también a los escalones (que tienen su propio
        /// filtro por tenant), así que un visitante anónimo no ve el catálogo mayorista vacío.
        /// En modo unidad no se toca nada: la puerta no aplica.
        /// </summary>
        private static IQueryable<Product> ApplyWholesaleGate(IQueryable<Product> query,
            CatalogPriceMode priceMode)
            => priceMode == CatalogPriceMode.Wholesale
                ? query.Where(product => product.WholesaleEnabled
                    && product.WholesalePackSize > 0
                    && product.WholesaleTiers.Any())
                : query;

        /// <summary>
        /// Filtros del listado, aplicados en SQL. El slug de categoría viaja tal cual lo manda el
        /// cliente; la comparación se hace en minúsculas para preservar la semántica insensible a
        /// mayúsculas que tenía el filtro en memoria.
        /// </summary>
        private static IQueryable<Product> ApplyPublishedFilters(IQueryable<Product> query,
            string? categorySlug, string? search)
        {
            if (!string.IsNullOrWhiteSpace(categorySlug))
            {
                string slug = categorySlug.Trim().ToLowerInvariant();
                query = query.Where(product => product.Category.Slug != null
                    && product.Category.Slug.ToLower() == slug);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                string term = search.Trim().ToLowerInvariant();
                query = query.Where(product => product.Name.ToLower().Contains(term));
            }

            return query;
        }

        public async Task<Product?> GetPublishedByIdAsync(Guid storeId, Guid productId)
        {
            IQueryable<Product> query = await PublishedQueryAsync(storeId, CancellationToken.None);

            return await query
                .Where(product => product.Id == productId)
                .Include(product => product.Images)
                .Include(product => product.WholesaleTiers)
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

        /// <inheritdoc />
        public async Task<IReadOnlyDictionary<Guid, string>> GetNamesByIdsAsync(
            IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken = default)
        {
            if (ids.Count == 0)
                return new Dictionary<Guid, string>();

            var rows = await _products
                .IgnoreQueryFilters()
                .Where(product => ids.Contains(product.Id))
                .Select(product => new { product.Id, product.Name })
                .ToListAsync(cancellationToken);

            return rows.ToDictionary(row => row.Id, row => row.Name);
        }
    }
}
