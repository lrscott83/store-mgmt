namespace Application.Dtos.SaleManagement
{
    public sealed class ProductDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; }    
        public Guid CategoryId { get; set; }
        public string CategoryName { get; set; } = null!;
        public decimal Price { get; set; }
        public int Order { get; set; }
        public bool AvailableToSale { get; set; } = true;
        public bool DiscountFromInventory { get; set; } = true;
        public string BusinessId { get; set; } = null!;
        public bool IsActive { get; set; }

        // --- Campos del catálogo web (plan 2026-09-27) ---

        /// <summary>Descripción del catálogo. Texto plano, nunca HTML.</summary>
        public string Description { get; set; } = string.Empty;
        /// <summary>% de descuento escalado (PERCENT_SCALE): 1250 == 12.50 %.</summary>
        public int PercentDiscountPrice { get; set; }
        /// <summary>Monto rebajado escalado (DISCOUNT_PRICE_SCALE): 500 == 5.00.</summary>
        public int DiscountPrice { get; set; }
        /// <summary>Marca "Nuevo" del catálogo.</summary>
        public bool IsNew { get; set; }
        /// <summary>Clave de la imagen principal del catálogo (null = sin imagen).</summary>
        public string? Image { get; set; }
        /// <summary>Galería del catálogo en orden de presentación.</summary>
        public List<string> Images { get; set; } = new();
        /// <summary>Precio final combinando % y monto rebajado (ver CatalogPricing).</summary>
        public decimal FinalPrice { get; set; }
        /// <summary>true si el producto tiene algún descuento de catálogo.</summary>
        public bool HasDiscount { get; set; }
    }
}
