namespace Domain.Common.Enums
{
    /// <summary>
    /// TIPO real de la orden: qué clase de venta es, no por dónde entró.
    ///
    /// El CANAL es otro dato y vive en <c>Order.IsOfflineOrder</c> (<c>true</c> = lo escribió el
    /// POS, <c>false</c> = lo creó el servidor). Antes existía <c>WhatsApp = 101</c> para marcar los
    /// pedidos del catálogo web, pero eso confundía las dos dimensiones: una venta mayorista hecha
    /// desde el catálogo se guardaba como "WhatsApp" y perdía su tipo real. El valor 101 se retiró y
    /// las filas históricas se migraron a <see cref="Normal"/> (migración
    /// Normalize-OrderType-And-Add-OrderItem-WholesaleSnapshot).
    ///
    /// Hoy el pedido del catálogo se guarda con el tipo que de verdad le toca:
    /// <see cref="Mayorista"/> cuando el catálogo publica precios mayoristas y <see cref="Normal"/>
    /// en caso contrario.
    /// </summary>
    public enum OrderType : int
    {
        Normal = 1,
        Mayorista = 2,
        Merma = 3,
        Otro = 100
    }
}
