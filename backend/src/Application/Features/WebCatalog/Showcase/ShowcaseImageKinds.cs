namespace Application.Features.WebCatalog.Showcase
{
    /// <summary>
    /// Los dos CONJUNTOS de imágenes del SHOWCASE (carrusel e imágenes del día), en el mismo formato
    /// que <c>BrandingImageKinds</c>: no son un enum, son segmentos de CARPETA dentro de la clave que
    /// se persiste, y esa clave acaba siendo una ruta. Que vivan como constantes nombradas evita que
    /// un handler escriba <c>"Carousel"</c> en un sitio y <c>"carousel"</c> en otro y se acaben con
    /// dos carpetas que parecen la misma.
    ///
    /// El almacenamiento sanea el valor igual (nadie más que el backend debería pasar uno), pero el
    /// que decide el nombre es quien llama, no el que guarda.
    ///
    /// El conjunto también existe como <c>StoreCatalogImageKind</c>: el enum es lo que viaja en el
    /// comando y lo que se persiste, y estas constantes son su traducción a carpeta.
    /// </summary>
    public static class ShowcaseImageKinds
    {
        /// <summary>Carrusel de la cabecera del catálogo público.</summary>
        public const string Carousel = "carousel";

        /// <summary>Bloque de imágenes del día (destacadas que el dueño cambia a mano).</summary>
        public const string Daily = "daily";

        /// <summary>
        /// Carpeta del <paramref name="kind"/>. Lo pone el almacenamiento; aquí solo se documenta que
        /// el showcase NO comparte carpeta con la marca (<c>branding</c>) ni con las imágenes de
        /// producto, aunque las tres compartan el prefijo <c>{tenant}/{store}/</c>.
        /// </summary>
        public const string Folder = "catalog";
    }
}