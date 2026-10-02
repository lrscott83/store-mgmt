using Application.Dtos.WebCatalog;
using Domain.Common.Catalog;
using Domain.Entities.Products;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Traduce un producto (tabla normal `Product`) a lo que ve el cliente final: precios legibles
    /// (final combinado y porcentaje desescalado) y URLs públicas listas para el catálogo.
    /// Publicación directa: no hay copia intermedia (decisión del Owner, 2026-09-28).
    ///
    /// La imagen tiene UNA sola fuente: `Product.Image` (decisión del Owner, 2026-10-01). La galería
    /// `ProductImage` es una segunda fuente que podía publicar una foto fantasma —la imagen que la
    /// vista Catálogo Web ya había quitado pero cuya fila seguía activa—, así que la lectura pública
    /// no la enumera: `ImageUrls` es la MISMA clave que `ImageUrl`, o la lista vacía.
    /// </summary>
    internal static class PublicCatalogProductMapper
    {
        public static PublicCatalogProductDto ToDto(Product product, string storeSlug)
        {
            string? mediaUrl = string.IsNullOrWhiteSpace(product.Image)
                ? null
                : CatalogPublicUrls.Media(storeSlug, product.Image!);

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
                CategoryId = product.CategoryId,
                CategoryName = product.Category?.Name ?? string.Empty,
                CategorySlug = product.Category?.Slug ?? string.Empty,
                ImageUrl = mediaUrl,
                ImageUrls = mediaUrl == null ? new List<string>() : new List<string> { mediaUrl },
            };
        }
    }
}
