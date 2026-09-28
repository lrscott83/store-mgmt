namespace Domain.Common.Catalog
{
    /// <summary>
    /// Precio final del catálogo web (decisión D7 del plan 2026-09-27).
    ///
    /// El porcentaje y el monto rebajado **se combinan**: primero se aplica el %, luego se
    /// resta el monto, con piso en 0:
    ///
    ///   final = max(0, round(price * (10000 - percentDiscountPrice) / 10000, 2) - discountPrice)
    ///
    /// Ejemplo: price 100 + percent 1250 (12.50 %) + discount 500 (5.00)
    ///          -> 100 - 12.50 = 87.50 -> 87.50 - 5.00 = 82.50
    ///
    /// Es la única implementación de la fórmula: la consumen la vista Catálogo Web y el
    /// catálogo público, y no se persiste un precio final duplicado.
    /// </summary>
    public static class CatalogPricing
    {
        public static decimal FinalPrice(decimal price, int scaledPercentDiscountPrice, int scaledDiscountPrice)
        {
            decimal priceWithPercent = decimal.Round(
                price * (CatalogScales.MAX_PERCENT_SCALED - scaledPercentDiscountPrice) / CatalogScales.MAX_PERCENT_SCALED,
                2,
                MidpointRounding.AwayFromZero);

            decimal finalPrice = priceWithPercent - CatalogScales.ToDiscountAmount(scaledDiscountPrice);
            return finalPrice < 0 ? 0m : finalPrice;
        }

        /// <summary>true si el producto tiene algún descuento (porcentaje o monto).</summary>
        public static bool HasDiscount(int scaledPercentDiscountPrice, int scaledDiscountPrice)
            => scaledPercentDiscountPrice > 0 || scaledDiscountPrice > 0;
    }
}
