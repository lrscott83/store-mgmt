namespace Domain.Common.Enums
{
    /// <summary>
    /// Tipo de comisión configurada por producto para un gestor de ventas.
    /// Es UNO u OTRO, nunca ambos (decisión del owner, 2026-10-21).
    /// </summary>
    public enum SalesCommissionType : int
    {
        /// <summary>Porcentaje sobre el precio final de la línea (0..100).</summary>
        Percentage = 1,

        /// <summary>Monto fijo por unidad, en la moneda configurada.</summary>
        Fixed = 2,
    }
}
