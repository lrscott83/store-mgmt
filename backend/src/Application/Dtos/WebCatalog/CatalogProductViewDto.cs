namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Producto del origen con sus campos de catálogo, tal como los necesita la vista Catálogo Web
    /// (módulo 18, plan 2026-09-27): una sola llamada para pintar la lista editable.
    /// </summary>
    public sealed class CatalogProductViewDto
    {
        public Guid Id { get; set; }
        public Guid CategoryId { get; set; }
        public string CategoryName { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public string Currency { get; set; } = string.Empty;
        public int Order { get; set; }
        /// <summary>false = la copia publicada está despublicada (fuera de venta o inactiva).</summary>
        public bool AvailableToSale { get; set; }
        public bool IsActive { get; set; }

        /// <summary>Descripción publicada. Texto plano, nunca HTML.</summary>
        public string Description { get; set; } = string.Empty;
        /// <summary>% de descuento escalado: 1250 == 12.50 %.</summary>
        public int PercentDiscountPrice { get; set; }
        /// <summary>Monto rebajado escalado: 500 == 5.00.</summary>
        public int DiscountPrice { get; set; }
        public bool IsNew { get; set; }
        /// <summary>Clave de la imagen principal (null = sin imagen).</summary>
        public string? Image { get; set; }
        /// <summary>Galería en orden de presentación.</summary>
        public List<string> Images { get; set; } = new();
        /// <summary>Precio final combinando % y monto rebajado.</summary>
        public decimal FinalPrice { get; set; }
        public bool HasDiscount { get; set; }
    }
}
