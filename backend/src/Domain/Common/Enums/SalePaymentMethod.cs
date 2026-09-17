namespace Domain.Common.Enums
{
    /// <summary>
    /// payment-methods-percent-tax (plan 2026-09-17): forma de pago de una venta.
    /// Espejo por VALOR del enum TS `SalePaymentMethod` del frontend — la
    /// serialización es el número, este orden queda CONGELADO desde el día 1.
    /// Default: Efectivo (toda venta histórica sin método explícito fue en efectivo).
    /// "Transferencia (X)" es Transferencia + la moneda de la Order (Order.Currency);
    /// Transferencia-CUP reemplaza al histórico "Tarjeta" del frontend.
    /// </summary>
    public enum SalePaymentMethod : int
    {
        Efectivo = 0,
        Zelle = 1,
        Transferencia = 2
    }
}
