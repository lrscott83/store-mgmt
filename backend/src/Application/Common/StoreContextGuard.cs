using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Domain.Common.Extensions;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Common
{
    /// <summary>
    /// El guard de tienda de los endpoints de gestión de pedidos: resuelve la tienda de la sesión y
    /// responde 400 `StoreNotSelected` cuando el contexto no trae ninguna.
    ///
    /// Vive en UN solo sitio porque los seis handlers de pedidos lo necesitaban idéntico, y una
    /// copia por handler es exactamente el sitio donde una de ellas acaba respondiendo otro código
    /// o sin el `UserExternalId` del mensaje. El texto y la clave localizada no cambian: esto no es
    /// un cambio de contrato, es el MISMO 400 que ya devolvían.
    /// </summary>
    internal static class StoreContextGuard
    {
        /// <summary>
        /// La tienda de la sesión, o el 400 `StoreNotSelected`.
        ///
        /// Devuelve el id en vez de solo validar porque un guard que no entrega lo que comprueba
        /// obliga a cada handler a volver a leer el contexto, y ahí es donde una lectura y otra se
        /// separan. `Guid.Empty` es el "sin tienda": <c>ToGuid</c> ya convierte la cadena vacía y
        /// la inválida en ese valor.
        /// </summary>
        public static Guid RequireStoreId(
            IHttpContextService httpContextService, IStringLocalizer<I18n> localizer)
        {
            Guid storeId = httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
            {
                throw new ApiException(
                    localizer["StoreNotSelected", httpContextService.UserExternalId],
                    HttpStatusCode.BadRequest);
            }

            return storeId;
        }
    }
}
