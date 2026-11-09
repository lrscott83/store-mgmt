using Domain.Common.Enums;
using Domain.Entities.StoreCatalogSettings;

namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// MARCA de una tienda (F8): lo que el dueño configura en la vista Catálogo Web y lo que el
    /// catálogo público pinta.
    ///
    /// Son CLAVES, no URLs, y es deliberado. La clave es lo que se persiste; la URL pública la
    /// compone el config anónimo (F1) con el slug de la tienda
    /// (<c>CatalogPublicUrls.Media</c>), que es el único que sabe resolver el slug. Devolver aquí
    /// una URL sería inventar una ruta de almacenamiento que además no se puede construir sin el
    /// slug — o, peor, filtrar la ruta del servidor a la vista de gestión.
    ///
    /// `PaletteId` viaja porque la fila la tiene y porque la vista necesita conocerla. NO lo escribe
    /// el command de marca: las paletas se cancelaron por ahora (decisión del Owner, 2026-10-07) y
    /// queda la que el catálogo ya usa.
    ///
    /// La PLANTILLA (`TemplateId`) NO viaja aquí: pasó a ser SuperAdmin-only
    /// (`/v1/stores/{storeId}/catalog-template`), fuera de la configuración del Owner.
    /// </summary>
    public sealed class StoreCatalogBrandingDto
    {
        /// <summary>Clave del logo. null = sin logo.</summary>
        public string? LogoKey { get; set; }

        /// <summary>Clave del banner. null = sin banner.</summary>
        public string? BannerKey { get; set; }

        /// <summary>
        /// Paleta que aplica el catálogo. Nunca vacía: sin fila, o con una en blanco, se devuelve
        /// <see cref="StoreCatalogSettings.DefaultPaletteId"/> — la que el catálogo ya usa hoy, para
        /// que una tienda recién sincronizada no se vea rota.
        /// </summary>
        public string PaletteId { get; set; } = StoreCatalogSettings.DefaultPaletteId;

        /// <summary>
        /// Cuántos elementos por fila muestra la rejilla del catálogo público en MÓVIL: 1 o 2
        /// (decisión del owner, 2026-10-12). Nunca fuera de rango: el valor por defecto es
        /// <see cref="StoreCatalogSettings.DefaultMobileColumns"/> (2, el comportamiento actual).
        /// </summary>
        public int MobileColumns { get; set; } = StoreCatalogSettings.DefaultMobileColumns;

        /// <summary>
        /// Modo de precio con el que se publica el catálogo, por NOMBRE de `CatalogPriceMode`
        /// ("Unit" / "Wholesale"). El número del enum es almacenamiento, no contrato — el mismo
        /// criterio que el catálogo público, para que un renumerado del enum no cambie la API.
        ///
        /// Una tienda sin fila se lee como <c>Unit</c>, que es como se publicaba el catálogo antes de
        /// que el modo existiera.
        /// </summary>
        public string PriceMode { get; set; } = nameof(CatalogPriceMode.Unit);

        /// <summary>
        /// La tienda tiene al menos un producto con configuración mayorista válida.
        ///
        /// Viaja en la LECTURA para que la vista pueda avisar sin una segunda petición: con el modo en
        /// `Wholesale` y esto en <c>false</c> el catálogo no publica NADA hasta que el dueño
        /// sincronice productos con precio mayorista (S7). El sistema avisa; nunca corrige ni
        /// desactiva solo la elección del dueño.
        /// </summary>
        public bool HasWholesalePricedProducts { get; set; }
    }
}