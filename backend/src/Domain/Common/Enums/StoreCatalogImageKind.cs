namespace Domain.Common.Enums
{
    /// <summary>
    /// A qué CONJUNTO del catálogo público pertenece una imagen de showcase: el carrusel de la
    /// cabecera o el bloque de imágenes del día (destacadas que el dueño cambia a mano).
    ///
    /// Son dos conjuntos INDEPENDIENTES por decisión del Owner (2026-10-07, C1): pueden estar los
    /// dos, solo uno, o ninguno. Por eso es un enum y no una lista —cada fila pertenece exactamente a
    /// uno— y por eso el catálogo público publica dos listas separadas en vez de un array plano: un
    /// array obligaría a la vista a particionarlo y a conocer estos valores.
    ///
    /// NO tiene caducidad por fecha en v1 (C4): "del día" es un bloque de destacadas manual, no un
    /// Highlights que expire solo.
    ///
    /// Los valores son estables: van en la clave de almacenamiento (vía
    /// <c>ShowcaseImageKinds</c>) y en la URL pública, así que renombrarlos rompería lo ya subido.
    /// </summary>
    public enum StoreCatalogImageKind : int
    {
        /// <summary>Carrusel de la cabecera del catálogo público. Es el conjunto por defecto.</summary>
        Carousel = 0,

        /// <summary>Bloque de imágenes del día: platos, promos o productos a destacar.</summary>
        Daily = 1
    }
}