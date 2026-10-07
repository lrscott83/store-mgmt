using System;

namespace Domain.Common.Enums
{
    /// <summary>
    /// Estado de un pedido ONLINE (pedidos-whatsapp-persistencia, F2, decisiones D11/D18).
    ///
    /// Solo existe la secuencia `New → Accepted → Preparing → Ready → Delivered` más `Cancelled`.
    /// NO existe "En camino" en la v1 (D18): el reparto se gestiona con `Order.DriverId` sin
    /// intercalar un estado nuevo.
    ///
    /// Los valores numéricos son persistidos (columna `Order.Status`), así que no se reutilizan ni
    /// se reordenan. La tabla de transiciones válidas vive en `Order.ChangeStatus`.
    /// </summary>
    public enum OrderStatus : int
    {
        /// <summary>Pedido recibido, todavía sin confirmar por la tienda.</summary>
        New = 0,

        /// <summary>La tienda confirmó el pedido.</summary>
        Accepted = 1,

        /// <summary>En preparación.</summary>
        Preparing = 2,

        /// <summary>Listo para recoger o entregar.</summary>
        Ready = 3,

        /// <summary>Terminado (entregado o recogido).</summary>
        Delivered = 4,

        /// <summary>Cancelado. Estado terminal, igual que <see cref="Delivered"/>.</summary>
        Cancelled = 5
    }
}