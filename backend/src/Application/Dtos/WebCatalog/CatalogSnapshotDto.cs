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

        // --- Configuración mayorista (hechos del POS, igual que el precio minorista) ---
        //
        // Viaja SIEMPRE, con o sin modo mayorista en el catálogo: el modo decide qué se publica,
        // no qué se sincroniza. El POS es el dueño de estos datos (los edita en el producto), así
        // que el espejo los escribe tal cual y NUNCA los inventa.
        //
        // `null` (o el campo ausente del JSON) = "el snapshot no habla de este hecho": un bundle
        // viejo del POS, o un snapshot parcial, NO conoce el campo. Un valor ausente NO es un
        // valor cero ni un borrado: el espejo deja lo guardado como está. Por eso los tres hechos
        // son nulables — con un `bool`/`int` no nulable el default de .NET (false/0) pisaría la
        // configuración real del dueño cada vez que un cliente viejo sincronizara.

        /// <summary>El producto se vende también por paquetes. `null` = no tocar lo guardado.</summary>
        public bool? WholesaleEnabled { get; set; }

        /// <summary>Unidades por paquete/caja. `null` = no tocar lo guardado.</summary>
        public int? WholesalePackSize { get; set; }

        /// <summary>
        /// Unidad de medida del dueño ("caja", "paquete"). `null` = no tocar lo guardado; una
        /// cadena en blanco sí es un valor y limpia la unidad (el espejo la guarda como null).
        /// </summary>
        public string? WholesaleUnitLabel { get; set; }

        /// <summary>
        /// Escalones de precio mayorista. Tres estados distintos, no dos:
        /// - `null` = "el snapshot no habla de los escalones" (bundle viejo del POS, snapshot
        ///   parcial): el espejo NO toca los guardados. Ausente no significa "no hay".
        /// - lista vacía = "el producto no tiene escalones": el espejo deja la tabla limpia.
        /// - lista con elementos = el conjunto deseado, reemplazado solo si cambió.
        /// </summary>
        public List<CatalogSnapshotWholesaleTierDto>? WholesaleTiers { get; set; }
    }

    /// <summary>
    /// Un escalón mayorista del producto en el snapshot. El precio es POR UNIDAD dentro del
    /// paquete, igual que en el POS y en la tabla `ProductWholesaleTier`.
    /// </summary>
    public sealed class CatalogSnapshotWholesaleTierDto
    {
        /// <summary>Mínimo de paquetes a partir del cual aplica.</summary>
        public int MinPacks { get; set; }

        /// <summary>Precio de una unidad dentro del paquete.</summary>
        public decimal PricePerUnit { get; set; }

        /// <summary>Moneda del precio, por VALOR del enum `Currency`. Ausente = la del producto.</summary>
        public int? Currency { get; set; }
    }
}
