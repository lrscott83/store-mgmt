using Domain.Common.Enums;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Traduce el modo de precio a lo que viaja al cliente final: el NOMBRE del enum
    /// (<c>"Unit"</c> / <c>"Wholesale"</c>), nunca su número.
    ///
    /// La traducción vive en un solo sitio porque la cabecera y cada producto del catálogo tienen
    /// que decir lo MISMO: dos `ToString()` separados divergen en el primer caso raro, y aquí el
    /// caso raro es real — una tienda sin fila de configuración llega al código con el valor por
    /// defecto del enum (<c>0</c>), que no es ninguno de los dos modos. Solo `Wholesale` es
    /// mayorista; todo lo demás se publica como unidad, que es el comportamiento histórico.
    /// </summary>
    internal static class PublicCatalogPriceModeWire
    {
        public static string ToWire(CatalogPriceMode priceMode)
            => priceMode == CatalogPriceMode.Wholesale
                ? nameof(CatalogPriceMode.Wholesale)
                : nameof(CatalogPriceMode.Unit);
    }
}
