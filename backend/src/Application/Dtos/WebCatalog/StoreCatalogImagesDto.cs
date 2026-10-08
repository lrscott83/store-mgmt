namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Las imágenes del showcase de UNA tienda, agrupadas por conjunto.
    ///
    /// Dos LISTAS y no un array plano, por la decisión del Owner (2026-10-07, C1): los conjuntos son
    /// independientes —pueden estar los dos, solo uno, o ninguno— y la vista renderiza dos secciones
    /// distintas. Un array plano la obligaría a particionarlo en el cliente y a conocer los valores de
    /// <c>StoreCatalogImageKind</c>, que es exactamente lo que este DTO existe para no filtrar.
    ///
    /// Ambas listas están SIEMPRE presentes, aunque estén vacías: `null` y `[]` no son lo mismo para
    /// una vista que va a pintar dos bloques, y el catálogo público necesita poder preguntar "¿hay
    /// carrusel?" sin comprobar antes que la lista existe.
    /// </summary>
    public sealed class StoreCatalogImagesDto
    {
        /// <summary>Imágenes del carrusel de la cabecera, en el orden elegido por el dueño.</summary>
        public IReadOnlyList<StoreCatalogImageDto> Carousel { get; set; } = [];

        /// <summary>Imágenes del día, en el orden elegido por el dueño.</summary>
        public IReadOnlyList<StoreCatalogImageDto> Daily { get; set; } = [];
    }
}