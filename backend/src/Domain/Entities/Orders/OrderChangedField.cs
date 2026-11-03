namespace Domain.Entities.Orders
{
    /// <summary>
    /// Campos de <see cref="Order"/> que una operación de ESCRITURA puede mutar. El dominio los
    /// devuelve desde <see cref="Order.ChangeStatus"/> y <see cref="Order.ChangePaymentStatus"/>
    /// para que quien persiste no tenga que mantener a mano una lista de columnas: una lista así se
    /// queda corta en cuanto la regla de negocio crece, y lo hace en silencio (la columna nueva se
    /// muta en memoria y nunca llega a la base).
    ///
    /// No son nombres de columna a propósito: el dominio no sabe cómo se llama la columna ni si
    /// existe. El mapeo a nombres de propiedad de EF vive en la infraestructura, en un solo lugar.
    /// </summary>
    [Flags]
    public enum OrderChangedField
    {
        None = 0,
        Status = 1,
        CancellationReason = 2,
        DriverId = 4,
        PaymentStatus = 8,
        PaidAt = 16,
    }
}
