namespace Application.Common
{
    /// <summary>
    /// Los límites del catálogo de repartidores (F7), en UN solo sitio.
    ///
    /// Estaban duplicados en el comando de alta y en el de edición, y una copia por comando es
    /// exactamente donde una de ellas se queda atrás: el validador de la edición aceptaría un valor
    /// que la columna rechaza, y el 400 se convertiría en un 500 del INSERT. Los nombres públicos
    /// (<c>CreateDeliveryDriverCommand.NameMaxLength</c> / <c>PhoneMaxLength</c>) se conservan
    /// apuntando aquí, así que ningún llamador cambia.
    ///
    /// Los números son los de la COLUMNA (<c>DeliveryDriverEntityTypeConfiguration</c>), no una
    /// decisión estética.
    /// </summary>
    public static class DeliveryDriverLimits
    {
        /// <summary>Límite de la columna `Name`.</summary>
        public const int NameMaxLength = 200;

        /// <summary>Límite de la columna `Phone`; 32 como <c>Order.CustomerPhone</c>.</summary>
        public const int PhoneMaxLength = 32;

        /// <summary>
        /// Mínimo de DÍGITOS de un teléfono marcable. No es un formato: el teléfono sigue siendo
        /// texto libre con prefijo internacional (D17) y las separaciones son libres.
        /// </summary>
        public const int PhoneMinDigits = 6;
    }
}
