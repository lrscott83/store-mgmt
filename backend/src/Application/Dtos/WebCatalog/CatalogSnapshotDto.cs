namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Foto del catálogo LOCAL del POS (plan 2026-09-27). El módulo es offline-first: los productos
    /// viven en el dispositivo y el servidor no los conoce, así que "Sincronizar Catálogo" viaja con
    /// esta foto — los ids son los Guid que el POS ya generó, y el servidor los respeta para que la
    /// copia publicada quede 1:1 con el origen.
    ///
    /// Solo lleva HECHOS del producto (lo que el POS es dueño: nombre, precio, categoría, orden,
    /// disponibilidad, moneda y galería). Los campos que se editan en la vista Catálogo Web
    /// (descripción, descuentos, "Nuevo", imagen principal) se quedan del lado del servidor y el
    /// espejo nunca los pisa (decisión D8).
    ///
    /// Ausente del snapshot = ya no existe en el dispositivo: su producto/categoría espejo se marca
    /// inactivo y la copia publicada se despublica, nunca se borra (decisión D6).
    /// </summary>
    public sealed class CatalogSnapshotDto
    {
        public List<CatalogSnapshotCategoryDto> Categories { get; set; } = new();
        public List<CatalogSnapshotProductDto> Products { get; set; } = new();
    }

    /// <summary>Categoría local del POS (todos los campos son hechos: el POS es su dueño).</summary>
    public sealed class CatalogSnapshotCategoryDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Order { get; set; }
        public bool IsActive { get; set; } = true;
    }

    /// <summary>
    /// Producto local del POS. Los campos del catálogo web (descripción, descuentos, "Nuevo" e
    /// imagen principal) NO viajan aquí: el POS no los tiene y el servidor no debe perderlos.
    /// </summary>
    public sealed class CatalogSnapshotProductDto
    {
        public Guid Id { get; set; }
        public Guid CategoryId { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Price { get; set; }
        /// <summary>Moneda del precio (MultiMonedas), por VALOR del enum `Currency`. Ausente = CUP.</summary>
        public int? Currency { get; set; }
        public int Order { get; set; }
        public bool AvailableToSale { get; set; } = true;
        public bool IsActive { get; set; } = true;
        public string? BusinessId { get; set; }
        public bool DiscountFromInventory { get; set; } = true;
        /// <summary>
        /// Galería del producto, en orden de presentación (claves del almacenamiento). `null` =
        /// "el snapshot no habla de la galería": el POS no la tiene (sus fotos viven en el
        /// servidor, subidas desde la vista Catálogo Web), así que el espejo NO la toca. Lista
        /// vacía sí significa "sin imágenes" y la deja limpia.
        /// </summary>
        public List<string>? Images { get; set; }
    }
}
