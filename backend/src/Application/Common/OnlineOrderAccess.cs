using Application.Exceptions;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Common
{
    /// <summary>
    /// El par "cargar el pedido de ESTA tienda o 404" de los endpoints de pedidos.
    ///
    /// El `storeId` va dentro del MISMO predicado que el id, en el repositorio: pedir el pedido
    /// primero y comprobar la tienda después dejaría una ventana con el pedido ajeno ya cargado, y
    /// "lo toco si no es mío" es el patrón que produce la fuga entre tiendas (criterio 7).
    ///
    /// Hay DOS lecturas porque los PATCH no necesitan lo mismo que el detalle: el pago y el
    /// repartidor solo escriben columnas de la fila y no leen ni las líneas ni el repartidor, así
    /// que cargarlos sería dos `JOIN` por petición para tirar el resultado. El mensaje del 404 es el
    /// mismo en las dos, y es deliberadamente indistinguible de "existe en otra tienda".
    /// </summary>
    internal static class OnlineOrderAccess
    {
        /// <summary>
        /// Mensaje del 404, idéntico al que devolvían los handlers. Va literal, no por
        /// `IStringLocalizer`, porque la clave equivalente en `Resources/Localization/*.resx` no
        /// existe todavía: un texto en inglés claro es mejor que una clave sin traducir que el
        /// cliente recibiría tal cual.
        /// </summary>
        public const string NotFoundMessage = "Online order not found.";

        /// <summary>
        /// El pedido CON sus líneas y su repartidor: lo que necesita el detalle y la rama de
        /// comisión del cambio de estado (que recorre `OrderItems`).
        /// </summary>
        public static async Task<Order> GetWithItemsAsync(
            IOrderRepository orderRepository, Guid storeId, Guid orderId,
            CancellationToken cancellationToken = default)
        {
            Order? order = await orderRepository.GetByIdWithItemsAsync(storeId, orderId, cancellationToken);
            return order ?? throw NotFound();
        }

        /// <summary>
        /// La FILA del pedido, sin líneas ni repartidor: lo que necesitan los PATCH que solo mutan
        /// columnas propias (pago y reparto).
        /// </summary>
        public static async Task<Order> GetRowAsync(
            IOrderRepository orderRepository, Guid storeId, Guid orderId,
            CancellationToken cancellationToken = default)
        {
            Order? order = await orderRepository.GetByIdAsync(storeId, orderId, cancellationToken);
            return order ?? throw NotFound();
        }

        private static ApiException NotFound()
            => new(NotFoundMessage, HttpStatusCode.NotFound);
    }
}
