using System;

namespace Domain.Common.Enums
{
    /// <summary>
    /// Cómo se entrega un pedido ONLINE (pedidos-whatsapp-persistencia, F2).
    ///
    /// No es el modo de una venta del POS: es la elección de la persona que compra. Cada tienda
    /// decide cuáles admite en su configuración (`StoreCatalogSettings.PickupEnabled` /
    /// `DeliveryEnabled`), y el comando de creación lo valida contra eso.
    /// </summary>
    public enum OrderDeliveryType : int
    {
        /// <summary>Recogida en la tienda. Estado inicial por defecto.</summary>
        Pickup = 0,

        /// <summary>Envío a domicilio. Exige `Order.DeliveryAddress` y aplica el costo de envío.</summary>
        Delivery = 1
    }
}