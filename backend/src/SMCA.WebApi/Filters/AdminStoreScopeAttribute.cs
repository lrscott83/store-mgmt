using Application.Abstractions.HttpContext;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace SMCA.WebApi.Filters
{
    /// <summary>
    /// Store scope for the SuperAdmin-only, store-scoped admin endpoints
    /// (`/api/v1/stores/{storeId}/catalog/...`).
    ///
    /// A SuperAdmin has no <c>SelectedStoreId</c>, so every existing catalog handler — which resolves
    /// its store from <see cref="IHttpContextService.StoreId"/> — would run against
    /// <see cref="Guid.Empty"/>. This filter takes the store from the ROUTE, verifies the caller is a
    /// SuperAdmin, and publishes it as the request's store context. <see cref="Services.HttpContextService"/>
    /// honors that item ONLY for a SuperAdmin and ONLY when this filter ran, so no other route,
    /// role or claim can change its store scope.
    ///
    /// Deliberately opt-in and separate from <see cref="HasPermissionAttribute"/>: the permission
    /// filter's SuperAdmin bypass is about features/modules, not about which store a request is
    /// allowed to touch.
    /// </summary>
    public class AdminStoreScopeAttribute : TypeFilterAttribute
    {
        public AdminStoreScopeAttribute() : base(typeof(AdminStoreScopeFilter))
        {
        }
    }

    public class AdminStoreScopeFilter : IAsyncAuthorizationFilter
    {
        /// <summary>Key used to publish the route store to <c>IHttpContextService.StoreId</c>.</summary>
        public const string StoreIdItemKey = "AdminStoreScope.StoreId";

        private const string StoreIdRouteValue = "storeId";

        private readonly IHttpContextService _httpContextService;

        public AdminStoreScopeFilter(IHttpContextService httpContextService)
        {
            _httpContextService = httpContextService;
        }

        public Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            if (!_httpContextService.IsSuperAdmin)
            {
                context.Result = new ForbidResult();
                return Task.CompletedTask;
            }

            // The route declares `{storeId:guid}`, so a malformed value never reaches this filter —
            // it fails routing with a 404. Keep the parse defensive anyway: publishing an empty or
            // unparsable value would silently drop the request back to the (absent) claim store.
            string? rawStoreId = context.RouteData.Values[StoreIdRouteValue]?.ToString();
            if (Guid.TryParse(rawStoreId, out Guid storeId) && storeId != Guid.Empty)
            {
                context.HttpContext.Items[StoreIdItemKey] = storeId.ToString();
            }

            return Task.CompletedTask;
        }
    }
}
