namespace Domain.Common.Enums
{
    /// <summary>
    /// Estado de liquidación de una comisión de gestor de ventas. Solo hay dos:
    /// pendiente y pagada. El pago es completo y lo registra el Owner.
    /// </summary>
    public enum SalesCommissionStatus : int
    {
        Pending = 0,
        Paid = 1,
    }
}
