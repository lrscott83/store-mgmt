namespace Domain.Common.Limits
{
    /// <summary>
    /// Límites de los campos del catálogo web (plan 2026-09-27). Viven en el Domain para que la
    /// validación de la API, las columnas de EF y la vista Catálogo Web informen lo mismo.
    /// </summary>
    public static class ProductEntityLimits
    {
        /// <summary>Longitud máxima de la descripción (texto plano, sin HTML).</summary>
        public const int DescriptionMaxLength = 4000;

        /// <summary>Longitud máxima de la clave de una imagen del catálogo.</summary>
        public const int ImagePathMaxLength = 512;

        /// <summary>Máximo de imágenes en la galería de un producto.</summary>
        public const int MaxImagesPerProduct = 6;

        /// <summary>Tamaño máximo por imagen: 2 MB.</summary>
        public const int MaxImageSizeInBytes = 2 * 1024 * 1024;

        /// <summary>Extensiones aceptadas para las imágenes del catálogo.</summary>
        public static readonly string[] AllowedImageExtensions = { ".jpg", ".jpeg", ".png", ".webp" };

        /// <summary>Tipos de contenido aceptados para las imágenes del catálogo.</summary>
        public static readonly string[] AllowedImageContentTypes =
            { "image/jpeg", "image/png", "image/webp" };

        public const string AllowedImageFormatsLabel = "jpg, png o webp";
    }
}
