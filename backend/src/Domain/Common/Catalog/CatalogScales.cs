namespace Domain.Common.Catalog
{
    /// <summary>
    /// Escalas de los descuentos del catálogo web (módulo WebCatalog, plan 2026-09-27).
    ///
    /// El porcentaje y el monto rebajado se persisten y se transportan por HTTP como enteros
    /// escalados (nunca como decimales) para que el contrato no dependa de la cultura ni del
    /// redondeo del serializador. Ambos usan 2 decimales:
    ///
    ///   PercentDiscountPrice = 1250  ->  12.50 %
    ///   DiscountPrice        =  500  ->   5.00
    /// </summary>
    public static class CatalogScales
    {
        /// <summary>2 decimales: 1250 == 12.50 %.</summary>
        public const int PERCENT_SCALE = 100;

        /// <summary>2 decimales: 500 == 5.00.</summary>
        public const int DISCOUNT_PRICE_SCALE = 100;

        /// <summary>Porcentaje máximo aceptado: 10000 == 100.00 %.</summary>
        public const int MAX_PERCENT_SCALED = 100 * PERCENT_SCALE;

        /// <summary>Entero escalado -> porcentaje decimal (1250 -> 12.50).</summary>
        public static decimal ToPercent(int scaledPercent) => (decimal)scaledPercent / PERCENT_SCALE;

        /// <summary>Porcentaje decimal -> entero escalado (12.50 -> 1250).</summary>
        public static int ToScaledPercent(decimal percent)
            => (int)decimal.Round(percent * PERCENT_SCALE, MidpointRounding.AwayFromZero);

        /// <summary>Entero escalado -> monto decimal (500 -> 5.00).</summary>
        public static decimal ToDiscountAmount(int scaledDiscountPrice)
            => (decimal)scaledDiscountPrice / DISCOUNT_PRICE_SCALE;

        /// <summary>Monto decimal -> entero escalado (5.00 -> 500).</summary>
        public static int ToScaledDiscountAmount(decimal discountPrice)
            => (int)decimal.Round(discountPrice * DISCOUNT_PRICE_SCALE, MidpointRounding.AwayFromZero);

        /// <summary>true si el porcentaje escalado está dentro del rango permitido (0 .. 100 %).</summary>
        public static bool IsValidScaledPercent(int scaledPercent)
            => scaledPercent >= 0 && scaledPercent <= MAX_PERCENT_SCALED;
    }
}
