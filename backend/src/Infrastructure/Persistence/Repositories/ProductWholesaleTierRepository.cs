using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductWholesaleTierRepository
        : GenericRepository<ProductWholesaleTier, Guid>, IProductWholesaleTierRepository
    {
        private readonly DbSet<ProductWholesaleTier> _tiers;

        public ProductWholesaleTierRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _tiers = dbContext.Set<ProductWholesaleTier>();
        }

        /// <summary>
        /// Escalones de UN producto, ordenados por <c>MinPacks</c>: el escalón aplicable es el de
        /// mínimo más alto, así que el orden es parte de lo que el llamador espera leer.
        ///
        /// `IgnoreQueryFilters` es OBLIGATORIO aquí, y no un atajo: el camino que más usa este
        /// método es el ALTA del pedido público, que corre ANÓNIMO. Sin sesión, `_context.TenantId`
        /// es null y `_context.IsSuperAdmin` es false, así que el filtro global por tenant
        /// (`x.TenantId == _context.TenantId`) se traduce a `= NULL` y devuelve CERO filas — el
        /// catálogo mayorista publicaría los precios y el pedido los rechazaría como "no
        /// configurado", sin error de base. Es el mismo motivo por el que las demás lecturas
        /// anónimas de esta feature lo ignoran (`ProductRepository.GetPublishedByIdsAsync`,
        /// `GetPublicPriceModeAsync`, `StoreCatalogSettingsRepository.GetPublicByStoreIdAsync`,
        /// `StoreRepository.GetStoreByCatalogSlugAsync`).
        ///
        /// Lo que impide cruzar tenants no es el filtro, es la LLAVE: el llamador ya resolvió la
        /// tienda (por su slug público) y pide los escalones por `ProductId`, un id GUID que solo
        /// se obtiene del catálogo publicado de esa tienda. Un escalón de otra tienda exige acertar
        /// un GUID ajeno.
        /// </summary>
        public async Task<IList<ProductWholesaleTier>> GetByProductIdAsync(Guid productId)
        {
            return await _tiers
                .IgnoreQueryFilters()
                .Where(tier => tier.ProductId == productId)
                .OrderBy(tier => tier.MinPacks)
                .ToListAsync();
        }
    }
}
