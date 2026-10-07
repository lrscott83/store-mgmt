namespace Application.Dtos.OnlineOrdering
{
    /// <summary>
    /// Un repartidor de la tienda, tal como lo ve su panel (F7, vista "Repartidores").
    /// Espejo de <c>Domain/Entities/DeliveryDrivers/DeliveryDriver.cs</c>.
    ///
    /// SIN `TenantId`: el aislamiento por tienda ya está resuelto en la consulta y la vista no
    /// necesita saber el tenant de cada fila. SÍ lleva `StoreId` (a diferencia del DTO de
    /// configuración de F1): la respuesta dice de qué tienda es cada fila en lugar de dejarlo
    /// implícito, y no hay nada que el cliente pueda cambiar con él.
    ///
    /// NO lleva el número de pedidos asignados. Contarlo es leer `Order.DriverId` — es un dato de
    /// F5, y esta vista es el catálogo de personas, no la operación del pedido (D8).
    /// </summary>
    public sealed class DeliveryDriverDto
    {
        /// <summary>Identificador del repartidor. Es el `{id}` del PATCH de edición.</summary>
        public Guid Id { get; set; }

        /// <summary>Tienda a la que pertenece. Nunca cambia por API.</summary>
        public Guid StoreId { get; set; }

        /// <summary>Nombre por el que la tienda lo conoce.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Teléfono de contacto (texto libre, prefijo internacional).</summary>
        public string Phone { get; set; } = string.Empty;

        /// <summary>
        /// Si sigue dado de alta. La baja es LÓGICA: apagar esto NO borra la fila ni los pedidos
        /// que ya llevó (criterio 3); solo lo esconde de las listas por defecto.
        /// </summary>
        public bool IsActive { get; set; }
    }
}
