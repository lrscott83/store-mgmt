namespace Domain.Common.Enums
{
    /// <summary>
    /// Modo de PRECIO del catálogo web de una tienda (configuración del catálogo).
    ///
    /// El modo decide QUÉ se publica y con qué precio, nunca qué se sincroniza: la sincronización
    /// del catálogo lleva siempre los dos precios de cada producto (minorista y mayorista), así que
    /// el dueño puede alternar el modo sin volver a sincronizar.
    /// </summary>
    public enum CatalogPriceMode : int
    {
        /// <summary>Precio por unidad (el de siempre). Es el valor de una tienda sin configurar.</summary>
        Unit = 1,

        /// <summary>
        /// Precio mayorista: se pide por paquetes y el precio por unidad sale del escalón
        /// aplicable. Los productos SIN configuración mayorista válida no se publican.
        /// </summary>
        Wholesale = 2
    }
}
