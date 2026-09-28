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
        public List<PublicCatalogCategoryDto> Categories { get; set; } = new();
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
