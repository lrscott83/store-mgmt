using Application.Abstractions.HttpContext;
using Application.Dtos.StoreSync;
using Application.Exceptions;
using Domain.Common.Extensions;
using Domain.Entities.StoreSyncFiles;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreSync
{
    /// <summary>
    /// Ámbito de tiendas del llamador, en UN solo sitio.
    ///
    /// Hace falta porque <c>[HasPermission]</c> autoriza contra la tienda SELECCIONADA del token,
    /// no contra la tienda que dice el cuerpo o la fila: sin esta comprobación un Owner podría
    /// subir o borrar el fichero de la tienda de otro tenant. Las tres reglas (S5, S6, S8):
    ///
    ///   * Owner / ReSeller → cualquier tienda suya (<see cref="IStoreRepository.GetAllStoresByOwnerUserIdAsync"/>).
    ///   * Cualquier otro rol → SOLO la tienda del claim (<see cref="IHttpContextService.StoreId"/>),
    ///     que emite el servidor al iniciar sesión. No se puede falsificar desde el cuerpo.
    ///
    /// Devuelve null en vez de lanzar: el mensaje del 404 es distinto según el recurso que pidió el
    /// cliente (una tienda al subir, un fichero al descargar o borrar) y el handler es quien lo
    /// conoce. Lo que NO cambia es el CÓDIGO: fuera del ámbito siempre es 404, nunca 403, para no
    /// revelar qué ids existen.
    /// </summary>
    internal static class StoreSyncStoreScope
    {
        /// <summary>
        /// ¿El llamador ve todas las tiendas de su tenant? Owner y ReSeller sí; el resto, solo la
        /// suya. Es la misma bifurcación que decide el filtro de la lista (S5).
        /// </summary>
        public static bool IsTenantWide(IHttpContextService httpContextService)
            => httpContextService.IsOwnerAdmin || httpContextService.IsReSeller;

        /// <summary>
        /// La tienda por la que se filtra la LISTA: null cuando el llamador ve todo el tenant, y la
        /// tienda del claim cuando es un StoreUser. Un claim vacío produce <see cref="Guid.Empty"/>,
        /// que no casa con ninguna fila — nunca "todas".
        /// </summary>
        public static Guid? StoreFilterFor(IHttpContextService httpContextService)
            => IsTenantWide(httpContextService) ? null : httpContextService.StoreId.ToGuid();

        /// <summary>
        /// La tienda pedida si el llamador puede actuar sobre ella; null si no existe, está fuera
        /// de su ámbito o es de otro tenant.
        /// </summary>
        public static async Task<Store?> TryResolveAsync(Guid storeId, IHttpContextService httpContextService,
            IStoreRepository storeRepository, CancellationToken cancellationToken)
        {
            if (storeId == Guid.Empty)
                return null;

            Guid userId = httpContextService.UserExternalId.ToGuid();
            if (userId == Guid.Empty)
                return null;

            if (IsTenantWide(httpContextService))
            {
                IEnumerable<Store> owned = await storeRepository.GetAllStoresByOwnerUserIdAsync(userId);
                return owned.FirstOrDefault(store => store.Id == storeId);
            }

            // StoreUser: la tienda del claim es el ámbito COMPLETO. Se comprueba la existencia
            // después, para que una tienda borrada no siga siendo un destino válido.
            if (httpContextService.StoreId.ToGuid() != storeId)
                return null;

            return await storeRepository.GetStoreByIdAsync(storeId);
        }

        /// <summary>El 404 compartido de "tienda fuera de ámbito".</summary>
        public static ApiException StoreNotAllowed(IStringLocalizer<I18n> localizer)
            => new(localizer["StoreSyncFileStoreNotAllowed"], HttpStatusCode.NotFound);

        /// <summary>El 404 compartido de "fichero fuera de ámbito o inexistente".</summary>
        public static ApiException FileNotFound(IStringLocalizer<I18n> localizer)
            => new(localizer["StoreSyncFileNotFound"], HttpStatusCode.NotFound);
    }
}
