using Domain.Common.Enums;

namespace Application.Dtos.WebCatalog
{
    /// <summary>Estado del catálogo de la tienda seleccionada (cabecera de la vista Catálogo Web).</summary>
    public sealed class CatalogStatusDto
    {
        public string StoreSlug { get; set; } = string.Empty;
        public string CatalogUrl { get; set; } = string.Empty;
        public DateTime? CatalogSyncedAt { get; set; }
        /// <summary>Categorías del origen.</summary>
        public int SourceCategoriesCount { get; set; }
        /// <summary>Productos del origen (incluye los que no están en venta).</summary>
        public int SourceProductsCount { get; set; }
        /// <summary>Filas publicadas y activas.</summary>
        public int PublishedProductsCount { get; set; }
        /// <summary>Productos del origen sin imagen principal.</summary>
        public int ProductsWithoutMainImageCount { get; set; }
    }

    /// <summary>Categoría publicada en el catálogo público.</summary>
    public sealed class PublicCatalogCategoryDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public int ProductsCount { get; set; }
    }

    /// <summary>Cabecera del catálogo público: la tienda y sus categorías.</summary>
    public sealed class PublicCatalogDto
    {
        public Guid StoreId { get; set; }
        public string StoreName { get; set; } = string.Empty;
        public string StoreSlug { get; set; } = string.Empty;
        /// <summary>
        /// Modo de precio con el que se publica el catálogo: <c>"Unit"</c> o <c>"Wholesale"</c>.
        /// Es el nombre del enum, no su número: el número es almacenamiento, no contrato.
        /// </summary>
        public string PriceMode { get; set; } = nameof(CatalogPriceMode.Unit);
        public List<PublicCatalogCategoryDto> Categories { get; set; } = new();
    }

    /// <summary>
    /// Escalón mayorista publicado: a partir de <see cref="MinPacks"/> paquetes, cada unidad dentro
    /// del paquete cuesta <see cref="PricePerUnit"/>.
    ///
    /// <see cref="PackPrice"/> viaja porque es lo que el cliente ve ("la caja a $X"): el carrito
    /// multiplica ese número por los paquetes elegidos, así que no hace falta armar la cuenta en el
    /// cliente ni redondearla dos veces.
    /// </summary>
    public sealed class PublicCatalogWholesaleTierDto
    {
        public int MinPacks { get; set; }
        public decimal PricePerUnit { get; set; }
        /// <summary>Precio de UN paquete: <c>PricePerUnit × packSize</c>.</summary>
        public decimal PackPrice { get; set; }
    }

    /// <summary>Producto publicado tal como lo ve el cliente final.</summary>
    public sealed class PublicCatalogProductDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        /// <summary>Descripción en texto plano (los saltos de línea se respetan en la vista).</summary>
        public string Description { get; set; } = string.Empty;
        public decimal Price { get; set; }
        /// <summary>Precio final combinando % y monto rebajado.</summary>
        public decimal FinalPrice { get; set; }
        public bool HasDiscount { get; set; }
        public int PercentDiscountPrice { get; set; }
        public decimal PercentDiscount { get; set; }
        public int DiscountPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public bool IsNew { get; set; }
        public string Currency { get; set; } = string.Empty;
        public Guid CategoryId { get; set; }
        public string CategoryName { get; set; } = string.Empty;
        public string CategorySlug { get; set; } = string.Empty;
        /// <summary>URL pública de la imagen principal (null si el producto no tiene).</summary>
        public string? ImageUrl { get; set; }
        /// <summary>URLs públicas de la galería, en orden.</summary>
        public List<string> ImageUrls { get; set; } = new();

        // --- Precio mayorista ---
        //
        // Los tres campos de precio de arriba (`Price`, `FinalPrice` y los descuentos) siguen siendo
        // el precio POR UNIDAD: el modo no los reinterpreta y el descuento del catálogo no se aplica
        // encima del mayorista (son dos números distintos, no uno derivado del otro). Lo que decide
        // cuál usa el cliente es `PriceMode`; el resto viaja SIEMPRE, porque es una propiedad del
        // producto y no del modo con el que se publica hoy.

        /// <summary>Modo de precio de la tienda: <c>"Unit"</c> o <c>"Wholesale"</c> (mismo valor que el de la cabecera).</summary>
        public string PriceMode { get; set; } = nameof(CatalogPriceMode.Unit);
        /// <summary>El dueño activó la venta por paquetes para este producto.</summary>
        public bool WholesaleEnabled { get; set; }
        /// <summary>Unidades por paquete. 0 cuando el producto no tiene config mayorista válida.</summary>
        public int WholesalePackSize { get; set; }
        /// <summary>Unidad de medida que escribió el dueño ("caja", "paquete"). null = no la configuró.</summary>
        public string? WholesaleUnitLabel { get; set; }
        /// <summary>Menor <c>MinPacks</c> de la config: la cantidad mínima vendible. null = sin config.</summary>
        public int? WholesaleMinPacks { get; set; }
        /// <summary>Precio por UNIDAD del escalón de menor <c>MinPacks</c>. null = sin config.</summary>
        public decimal? WholesaleUnitPrice { get; set; }
        /// <summary>Precio de UN paquete en ese primer escalón. null = sin config.</summary>
        public decimal? WholesalePackPrice { get; set; }
        /// <summary>Escalones ordenados por <c>MinPacks</c> ascendente. Vacía = sin config.</summary>
        public List<PublicCatalogWholesaleTierDto> WholesaleTiers { get; set; } = new();
    }

    /// <summary>Página de resultados del catálogo público.</summary>
    public sealed class PublicCatalogPageDto
    {
        public List<PublicCatalogProductDto> Items { get; set; } = new();
        public int Total { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
    }
}
