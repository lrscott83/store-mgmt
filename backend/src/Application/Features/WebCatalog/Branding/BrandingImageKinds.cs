namespace Application.Features.WebCatalog.Branding
{
    /// <summary>
    /// Los dos tipos de imagen de MARCA (F8). No son un enum: son segmentos de CARPETA dentro de
    /// la clave que se persiste, y esa clave acaba siendo una ruta. Que vivan como constantes
    /// nombradas evita que un handler escriba <c>"Logo"</c> en un sitio y <c>"logo"</c> en otro y
    /// se acaben con dos carpetas que parecen la misma.
    ///
    /// El almacenamiento sanea el valor igual (nadie más que el backend debería pasar uno), pero
    /// el que decide el nombre es quien llama, no el que guarda.
    /// </summary>
    public static class BrandingImageKinds
    {
        /// <summary>Logo de la tienda.</summary>
        public const string Logo = "logo";

        /// <summary>Banner de cabecera del catálogo público.</summary>
        public const string Banner = "banner";
    }
}