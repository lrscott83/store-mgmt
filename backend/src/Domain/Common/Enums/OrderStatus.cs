using System;

namespace Domain.Common.Enums
{
    /// <summary>
    /// Estado de un pedido ONLINE.
    ///
    /// Secuencia estricta, sin saltos: `Creado → Preparado → Entregado` en recogida, y
    /// `Creado → Preparado → Transportando → Entregado` con entrega a domicilio. `Cancelado` es
    /// alcanzable desde cualquier estado no terminal. La tabla de transiciones válidas vive en
    /// `Order.ChangeStatus`, que es la única puerta al estado.
    ///
    /// Los valores numéricos son persistidos (columna `Order.Status`), así que no se reutilizan ni
    /// se reordenan. `Cancelado` vale 10 a propósito: deja hueco para estados intermedios futuros
    /// sin renumerar los existentes.
    /// </summary>
    public enum OrderStatus : int
    {
        /// <summary>Pedido recibido, todavía sin preparar.</summary>
        Creado = 0,

        /// <summary>La tienda preparó el pedido: listo para entregar o para salir a reparto.</summary>
        Preparado = 1,

        /// <summary>
        /// En reparto. Solo existe en pedidos con <see cref="OrderDeliveryType.Delivery"/>: una
        /// recogida en tienda nunca pasa por aquí.
        /// </summary>
        Transportando = 2,

        /// <summary>
        /// Entregado (o recogido). Terminal. Deja el pedido como pagado: entregar equivale a haber
        /// cobrado.
        /// </summary>
        Entregado = 3,

        /// <summary>
        /// Cancelado. Terminal. Exige una razón de texto libre, que se guarda en
        /// `Order.CancellationReason`.
        /// </summary>
        Cancelado = 10
    }
}
