using Application.Exceptions;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog
{
    /// <summary>
    /// Aislamiento por TIENDA de un producto del catálogo web.
    ///
    /// El "store" de un producto NO está en el propio producto: sale de su categoría
    /// (<see cref="Product.CategoryId"/> → <see cref="ProductCategory.StoreId"/>), y esa es la
    /// comparación que este guard hace.
    ///
    /// Por qué existe: el filtro global de EF del <c>ApplicationDbContext</c> acota por TENANT, no
    /// por tienda. Un usuario de un tenant con varias tiendas pasaría el filtro y podría operar el
    /// producto de OTRA tienda si el handler se fía solo del `productId` de la ruta. Este guard
    /// cierra ese hueco con el MISMO 404 uniforme que ya usa `UpdateProductCatalogFieldsCommand`:
    /// un producto inexistente y uno de otra tienda responden igual, así el catálogo de una tienda
    /// nunca se edita desde otra.
    /// </summary>
    internal static class ProductStoreAccess
    {
        /// <summary>
        /// Verifica que <paramref name="product"/> pertenezca a <paramref name="storeId"/>. Lanza
        /// 404 uniforme (<c>ProductNotFound</c>) si no existe su categoría o es de otra tienda.
        /// </summary>
        public static async Task EnsureBelongsToStoreAsync(
            Product product,
            Guid storeId,
            IProductCategoryRepository productCategoryRepository,
            IStringLocalizer<I18n> localizer,
            Guid productId)
        {
            ProductCategory? category = await productCategoryRepository.GetByIdAsync(product.CategoryId);
            if (category == null || category.StoreId != storeId)
                throw new ApiException(localizer["ProductNotFound", nameof(productId)], HttpStatusCode.NotFound);
        }
    }
}
