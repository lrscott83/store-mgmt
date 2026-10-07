using System;

namespace Domain.Common.Enums
{
    /// <summary>
    /// Pago de un pedido ONLINE (pedidos-whatsapp-persistencia, F2, decisiones D3/D12).
    ///
    /// El pago es MANUAL y en efectivo/contra entrega (D3): por eso solo hay dos estados y NO
    /// hay método ni tipo de pago en `Order`/`OrderItem` — la marca la pone una persona.
    ///
    /// El pago es INDEPENDIENTE del estado del pedido (`Order.Status`): `Delivered` no obliga a
    /// `Paid` ni al revés.
    /// </summary>
    public enum OrderPaymentStatus : int
    {
        /// <summary>Pendiente. Estado inicial de todo pedido online.</summary>
        Pending = 0,

        /// <summary>Pagado.</summary>
        Paid = 1
    }
}