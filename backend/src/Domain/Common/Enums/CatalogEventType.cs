namespace Domain.Common.Enums
{
    /// <summary>
    /// Eventos del catálogo público que se registran para las estadísticas de visitas. Los valores
    /// numéricos quedan CONGELADOS: se persisten en la tabla `CatalogEvent`.
    /// </summary>
    public enum CatalogEventType : int
    {
        /// <summary>Carga de la página del catálogo (una por visita de página).</summary>
        PageView = 1,

        /// <summary>Apertura del detalle de un producto.</summary>
        ProductView = 2,

        /// <summary>El visitante agregó un producto al carrito.</summary>
        AddToCart = 3,

        /// <summary>El visitante abrió el checkout.</summary>
        CheckoutOpen = 4,
    }
}
