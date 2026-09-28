using Application.Dtos.WebCatalog;
using Domain.Common.Catalog;
using Domain.Entities.WebCatalog;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Traduce una fila publicada a lo que ve el cliente final: precios legibles (final combinado y
    /// porcentaje desescalado) y URLs públicas listas para el catálogo.
    /// </summary>
    internal static class PublicCatalogProductMapper
    {
        public static PublicCatalogProductDto ToDto(CatalogProduct product, string storeSlug)
        {
            List<string> imageUrls = product.Images
                .OrderBy(image => image.Order).ThenBy(image => image.CreatedDate)
                .Select(image => CatalogPublicUrls.Media(storeSlug, image.Path))
                .ToList();

            return new PublicCatalogProductDto
            {
                Id = product.Id,
                Name = product.Name,
                Description = product.Description ?? string.Empty,
                Price = product.Price,
                FinalPrice = product.FinalPrice,
                HasDiscount = product.HasDiscount,
                PercentDiscountPrice = product.PercentDiscountPrice,
                PercentDiscount = CatalogScales.ToPercent(product.PercentDiscountPrice),
                DiscountPrice = product.DiscountPrice,
                DiscountAmount = CatalogScales.ToDiscountAmount(product.DiscountPrice),
                IsNew = product.IsNew,
                Currency = product.Currency.ToString(),
                CategoryId = product.CatalogCategoryId,
                CategoryName = product.CatalogCategory?.Name ?? string.Empty,
                CategorySlug = product.CatalogCategory?.Slug ?? string.Empty,
                ImageUrl = string.IsNullOrWhiteSpace(product.Image) ? null : CatalogPublicUrls.Media(storeSlug, product.Image!),
                ImageUrls = imageUrls,
            };
        }
    }
}
