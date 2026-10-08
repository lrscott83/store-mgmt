using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;

namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Una imagen del showcase (carrusel o imágenes del día) tal como la ve el DUEÑO, en la vista
    /// Catálogo Web.
    ///
    /// Son CLAVES, no URLs, y es deliberado — el mismo motivo que en <see cref="StoreCatalogBrandingDto"/>:
    /// la clave es lo que se persiste, y la URL pública la compone el config anónimo (F1) con el slug
    /// de la tienda, que es el único que sabe resolverlo. Devolver aquí una URL sería inventar una
    /// ruta de almacenamiento que además no se puede construir sin el slug.
    ///
    /// `Id` viaja porque quitar y reordenar son por id: es lo único que la vista necesita para hablar
    /// de UNA imagen concreta sin identificarla por su clave.
    /// </summary>
    public sealed class StoreCatalogImageDto
    {
        /// <summary>Identificador de la imagen. Lo usan "quitar" y "reordenar".</summary>
        public Guid Id { get; set; }

        /// <summary>Conjunto al que pertenece.</summary>
        public StoreCatalogImageKind Kind { get; set; }

        /// <summary>Clave del archivo dentro del almacenamiento del catálogo.</summary>
        public string Key { get; set; } = string.Empty;

        /// <summary>Posición dentro del conjunto, empezando en 0.</summary>
        public int OrderIndex { get; set; }

        /// <summary>Pie de foto opcional. null = sin pie.</summary>
        public string? Caption { get; set; }

        /// <summary>Si la imagen se publica.</summary>
        public bool IsActive { get; set; }
    }
}