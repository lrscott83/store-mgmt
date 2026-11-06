using Application.Features.WebCatalog.Public;
using Domain.Common.Enums;

namespace Application.Features.WebCatalog.Branding
{
    /// <summary>
    /// Traducción entre el modo de precio y su forma de CONTRATO ("Unit" / "Wholesale").
    ///
    /// La escritura delega en `PublicCatalogPriceModeWire`, que es la única definición de la
    /// ortografía del contrato: si esta capa tuviera la suya, un cambio de nombre se aplicaría en un
    /// endpoint y no en el otro, y el dueño guardaría un modo que el catálogo público no reconocería.
    ///
    /// La lectura de entrada NO usa `Enum.TryParse` a propósito: ese método acepta el número ("2"),
    /// y el número es almacenamiento, no contrato — un cliente que mande la representación interna
    /// está hablando otro idioma y se rechaza con un 400 localizado.
    /// </summary>
    internal static class CatalogPriceModeWire
    {
        public static string ToWire(CatalogPriceMode mode) => PublicCatalogPriceModeWire.ToWire(mode);

        /// <summary>Modo válido, o null si el valor no es ninguno de los dos nombres del contrato.</summary>
        public static CatalogPriceMode? TryParse(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            string trimmed = value.Trim();

            if (string.Equals(trimmed, nameof(CatalogPriceMode.Unit), StringComparison.OrdinalIgnoreCase))
                return CatalogPriceMode.Unit;

            if (string.Equals(trimmed, nameof(CatalogPriceMode.Wholesale), StringComparison.OrdinalIgnoreCase))
                return CatalogPriceMode.Wholesale;

            return null;
        }
    }
}
