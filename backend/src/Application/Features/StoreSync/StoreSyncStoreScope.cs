using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Domain.Common.Constants;
using Domain.Common.Extensions;
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
    /// Hace falta porque <c>[HasPermission]</c> autoriza contra la tienda SELECCIONADA del token, no
    /// contra la tienda que dice el cuerpo o la fila: sin esta comprobación un Owner podría subir o
    /// borrar el fichero de la tienda de otro tenant.
    ///
    /// REGLA ÚNICA (corrige R3-3 de la revisión): la LISTA y las ACCIONES resuelven el MISMO
    /// conjunto de tiendas, con la misma lógica que el listado canónico de tiendas del usuario
    /// (<c>GetStoresByCurrentUserQuery</c>): SuperAdmin todas, ReSeller las que revende, cualquier
    /// otro rol las suyas. Antes la lista dejaba pasar a un ReSeller como "todo el tenant" mientras
    /// las acciones solo aceptaban tiendas propias, así que veía ficheros que no podía tocar.
    ///
    /// Fuera del conjunto siempre es 404, nunca 403, para no revelar qué ids existen.
    /// </summary>
    internal static class StoreSyncStoreScope
    {
        /// <summary>
        /// Las tiendas que el llamador puede listar Y tocar. Nunca devuelve null: un llamador sin
        /// tiendas recibe una lista vacía, que no casa con ninguna fila — el fallo es cerrado.
        /// </summary>
        public static async Task<IReadOnlyList<Store>> ResolveStoresAsync(
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            CancellationToken cancellationToken)
        {
            Guid userId = httpContextService.UserExternalId.ToGuid();
            if (userId == Guid.Empty)
                return [];

            // Cada rol por SU vía. `GetActiveStoresByUserIdAsync` busca tiendas cuyo OWNER es el
            // usuario, así que para un StoreUser devuelve vacío: su ámbito es la tienda del claim,
            // que emite el servidor al iniciar sesión y no se puede falsificar desde el cuerpo.
            //
            // NO hay rama para SuperAdmin a propósito (hallazgo R1-SUPERADMIN-SCOPE del review): darle
            // "todas las tiendas de todos los tenants" con IgnoreQueryFilters ampliaría el alcance de
            // una pantalla que no es suya y convertiría este helper en una vía para leer backups de
            // cualquier instalación. Un SuperAdmin no tiene tienda seleccionada, así que cae en el
            // camino del claim —vacío— y el resultado es "ninguna", igual que antes de este cambio.
            if (httpContextService.IsReSeller)
            {
                IEnumerable<Store> resold = await storeRepository.GetActiveStoresByReSellerUserIdAsync(
                    userId, excludeStoreId: DataUtils.DefaultStore.Id);
                return Distinct(resold);
            }

            if (httpContextService.IsOwnerAdmin)
            {
                IEnumerable<Store> owned = await storeRepository.GetActiveStoresByUserIdAsync(
                    userId, excludeStoreId: DataUtils.DefaultStore.Id);
                return Distinct(owned);
            }

            Guid claimStoreId = httpContextService.StoreId.ToGuid();
            if (claimStoreId == Guid.Empty)
                return [];

            Store? claimStore = await storeRepository.GetStoreByIdAsync(claimStoreId);
            return claimStore is null ? [] : [claimStore];
        }

        private static IReadOnlyList<Store> Distinct(IEnumerable<Store> stores)
            => stores
                .Where(store => store is not null)
                .GroupBy(store => store.Id)
                .Select(group => group.First())
                .ToList();

        /// <summary>Los ids del ámbito, para filtrar la lista.</summary>
        public static async Task<IReadOnlyCollection<Guid>> ResolveStoreIdsAsync(
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            CancellationToken cancellationToken)
            => (await ResolveStoresAsync(httpContextService, storeRepository, cancellationToken))
                .Select(store => store.Id)
                .ToArray();

        /// <summary>
        /// La tienda pedida si está dentro del ámbito del llamador; null si no existe, está fuera o
        /// es de otro tenant. La lista sale del MISMO conjunto que usa la lista, así que lo que se
        /// ve es exactamente lo que se puede tocar.
        /// </summary>
        public static async Task<Store?> TryResolveAsync(
            Guid storeId,
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            CancellationToken cancellationToken)
        {
            if (storeId == Guid.Empty)
                return null;

            IReadOnlyList<Store> allowed =
                await ResolveStoresAsync(httpContextService, storeRepository, cancellationToken);

            return allowed.FirstOrDefault(store => store.Id == storeId);
        }

        /// <summary>El 404 compartido de "tienda fuera de ámbito".</summary>
        public static ApiException StoreNotAllowed(IStringLocalizer<I18n> localizer)
            => new(localizer["StoreSyncFileStoreNotAllowed"], HttpStatusCode.NotFound);

        /// <summary>El 404 compartido de "fichero fuera de ámbito o inexistente".</summary>
        public static ApiException FileNotFound(IStringLocalizer<I18n> localizer)
            => new(localizer["StoreSyncFileNotFound"], HttpStatusCode.NotFound);
    }
}
