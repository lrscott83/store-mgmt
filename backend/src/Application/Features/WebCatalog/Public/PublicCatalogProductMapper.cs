using Application.Dtos.WebCatalog;
using Domain.Common.Catalog;
using Domain.Common.Enums;
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
    ///
    /// El precio mayorista se publica como CONFIG (paquete + escalones) y no como un precio final:
    /// el cliente elige paquetes y el precio lo resuelve `WholesalePricing` con el número de
    /// paquetes de verdad. Por eso los tres números del "primer escalón" viajan aparte de la lista
    /// de escalones: son el mínimo vendible que la tarjeta necesita mostrar sin recorrer la lista.
    ///
    /// MINIMIZACIÓN DE DATOS (hallazgo R1-001): en modo `Unit` el DTO no lleva un solo número
    /// mayorista. El catálogo público se sirve a visitantes anónimos y el JSON viaja completo aunque
    /// la tienda no pinte la tarjeta de paquetes, así que publicar ahí `wholesaleUnitPrice` y
    /// `wholesaleTiers` deja la lista de precios al por mayor al alcance de cualquiera que abra la
    /// pestaña de red: el catálogo minorista no puede filtrar el mayorista. `priceMode` sí viaja,
    /// porque es lo que le dice al cliente qué modo está mirando.
    /// </summary>
    internal static class PublicCatalogProductMapper
    {
        /// <param name="priceMode">
        /// Modo de la tienda con el que se publica este producto. Es OBLIGATORIO y sin valor por
        /// defecto (hallazgo R3-default-mode-label): un llamador que no lo resolviera seguía
        /// compilando y estampaba `Unit` en productos cuya cabecera decía `Wholesale`, así que el
        /// cliente veía el modo de un catálogo y los números del otro. Sin defecto, el compilador
        /// obliga a resolverlo.
        /// </param>
        public static PublicCatalogProductDto ToDto(
            Product product, string storeSlug, CatalogPriceMode priceMode)
        {
            string? mediaUrl = string.IsNullOrWhiteSpace(product.Image)
                ? null
                : CatalogPublicUrls.Media(storeSlug, product.Image!);

            // En modo unidad la config mayorista ni se lee: es el dato que no puede escapar.
            bool publishesWholesale = priceMode == CatalogPriceMode.Wholesale;

            // Ordenar aquí y no confiar en el orden de la base: el contrato dice "ascendente por
            // MinPacks" y el índice único de la tabla no impone orden de lectura.
            List<ProductWholesaleTier> tiers = publishesWholesale
                ? (product.WholesaleTiers ?? [])
                    .OrderBy(tier => tier.MinPacks)
                    .ToList()
                : [];

            // La MISMA puerta que usa el filtro SQL del catálogo mayorista: si el POS no vendería
            // esta config, el catálogo tampoco publica sus números (saldrían vacíos o sin sentido).
            // El modo va DELANTE: en unidad no hay config publicable aunque la base la tenga.
            bool hasWholesaleConfig = publishesWholesale && WholesalePricing.HasConfig(
                product.WholesaleEnabled, product.WholesalePackSize, tiers.Count);

            ProductWholesaleTier? firstTier = hasWholesaleConfig ? tiers[0] : null;

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
                PriceMode = PublicCatalogPriceModeWire.ToWire(priceMode),
                // En modo unidad el DTO no afirma nada sobre el otro modo: ni la bandera, ni la
                // unidad, ni el paquete. La bandera en `false` es la verdad del modo publicado, no
                // un borrado del dato guardado (la columna sigue ahí para el POS y el modo mayorista).
                WholesaleEnabled = publishesWholesale && product.WholesaleEnabled,
                WholesalePackSize = firstTier == null ? 0 : product.WholesalePackSize,
                WholesaleUnitLabel = publishesWholesale
                    && !string.IsNullOrWhiteSpace(product.WholesaleUnitLabel)
                        ? product.WholesaleUnitLabel
                        : null,
                WholesaleMinPacks = firstTier?.MinPacks,
                WholesaleUnitPrice = firstTier?.PricePerUnit,
                // Un paquete es una línea de UN paquete: se calcula con la misma fórmula del total
                // de línea para que ambos números no puedan divergir en el redondeo.
                WholesalePackPrice = firstTier == null
                    ? null
                    : WholesalePricing.LineTotal(1, product.WholesalePackSize, firstTier.PricePerUnit),
                WholesaleTiers = hasWholesaleConfig
                    ? tiers
                        .Select(tier => new PublicCatalogWholesaleTierDto
                        {
                            MinPacks = tier.MinPacks,
                            PricePerUnit = tier.PricePerUnit,
                            // Sin `packSize` un paquete no tiene precio: por eso la lista sale
                            // vacía cuando la config no es válida, en vez de con precios en cero.
                            PackPrice = WholesalePricing.LineTotal(
                                1, product.WholesalePackSize, tier.PricePerUnit),
                        })
                        .ToList()
                    : new List<PublicCatalogWholesaleTierDto>(),
            };
        }
    }
}
