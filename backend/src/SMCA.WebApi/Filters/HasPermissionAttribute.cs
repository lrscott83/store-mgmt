using Domain.Common.Enums;
using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Domain.Common.Extensions;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Features;

namespace SMCA.WebApi.Filters
{
    public class HasPermissionAttribute : TypeFilterAttribute
    {
        public HasPermissionAttribute(params StoreRoleFeatures[] storeRoleFeatures) 
            : base(typeof(HasUserPermissionRequirementFilter))
        {
            Arguments = [storeRoleFeatures];
        }
    }

    public class HasUserPermissionRequirementFilter : IAuthorizationFilter
    {
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly List<StoreRoleFeatures> _storeRoleFeatures;
        private readonly IAllowedFeaturesService _allowedFeaturesService;
        private readonly IStoreModuleRepository _storeModuleRepositorytory;
        private readonly IBillingService _billingService;

        public HasUserPermissionRequirementFilter(StoreRoleFeatures[] storeRoleFeatures,
            IStoreRoleFeatureRepository storeRoleFeatureRepository, IHttpContextService httpContextService,
            IReSellerRepository reSellerRepository, IAllowedFeaturesService allowedFeaturesService, IStoreModuleRepository storeModuleRepositorytory,
            IBillingService billingService)
        {
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _httpContextService = httpContextService;
            _reSellerRepository = reSellerRepository;
            _storeRoleFeatures = storeRoleFeatures.ToList();
            _allowedFeaturesService = allowedFeaturesService;
            _storeModuleRepositorytory = storeModuleRepositorytory;
            _billingService = billingService;
        }

        public void OnAuthorization(AuthorizationFilterContext context)
        {
            // If the action (method) has its own [HasPermission], the class-level filter
            // should skip and let the action-level attribute handle authorization.
            // This allows action-level to override/expand the class-level scope
            // (e.g., class-level allows SuperAdmin/StoresAdmin, action-level adds ReSellerAdmin).
            // IMPORTANT: we must NOT skip if THIS filter IS the action-level filter —
            // we distinguish by comparing _storeRoleFeatures against the class-level attributes.
            if (context.ActionDescriptor is ControllerActionDescriptor actionDescriptor)
            {
                var methodHasAttribute = actionDescriptor.MethodInfo
                    .GetCustomAttributes(false).Any(a => a is HasPermissionAttribute);

                if (methodHasAttribute)
                {
                    var classAttributes = actionDescriptor.ControllerTypeInfo
                        .GetCustomAttributes(false).OfType<HasPermissionAttribute>();

                    var isClassLevel = classAttributes.Any(classAttr =>
                        classAttr.Arguments.Length > 0
                        && classAttr.Arguments[0] is StoreRoleFeatures[] classFeatures
                        && _storeRoleFeatures.SequenceEqual(classFeatures));

                    if (isClassLevel)
                    {
                        return; // Class-level filter → skip, let action-level handle
                    }
                    // Otherwise, this IS the action-level filter → proceed with auth
                }
            }

            var currentUserId = _httpContextService?.UserExternalId;
            if (!string.IsNullOrEmpty(currentUserId))
            {
                // if user is not Super Admin, find out if it has any other authorized roles
                if (!_httpContextService.IsSuperAdmin)
                {
                    var storeModules = _storeModuleRepositorytory.GetAvailableModulesByStoreIdAsync(_httpContextService.StoreId.ToGuid()).Result;
                    var billing = _billingService.GetStoreBillingSummaryAsync(_httpContextService.StoreId.ToGuid()).Result;
                    List<int> storeModuleIds = FilterForBilling(storeModules, billing);
                    if (_httpContextService.IsOwnerAdmin || _httpContextService.IsReSeller)
                    {
                        var featureIds = _allowedFeaturesService.GetAllowedFeatureIdsForCurrentUserAsync(storeModuleIds).Result;
                        var hasPermission = _storeRoleFeatures.Any(srf => srf.GetFeatureType().HasValue && featureIds.Contains((int)srf.GetFeatureType().Value)); ;
                        if (!hasPermission)
                        {
                            context.Result = new ForbidResult();
                        }
                    } 
                    else
                    {
                        var hasUserPermission = _storeRoleFeatureRepository.HasUserAnyFeatureInStoreAsync(
                            currentUserId.ToGuid(), _httpContextService.StoreId.ToGuid(), _storeRoleFeatures, storeModuleIds).Result;
                        if (!hasUserPermission)
                        {
                            context.Result = new ForbidResult();
                        }
                    }
                    
                }
            }
            else
            {
                context.Result = new UnauthorizedResult();
            }
        }

        /// <summary>
        /// Filters modules based on the store's billing status.
        /// Free plan (NoAplica) → all modules accessible.
        /// Active paid plan (AlDia, PorVencer, EnGracia) → all modules accessible.
        /// Overdue (Vencido) → only free (PriceIncluded) modules accessible.
        /// </summary>
        internal static List<int> FilterForBilling(IEnumerable<Module> modules, StoreBillingSummary billing)
        {
            if (billing.Status == StoreBillingStatusType.NoAplica)
                return modules.Select(m => m.Id).ToList();

            if (billing.Status != StoreBillingStatusType.Vencido)
                return modules.Select(m => m.Id).ToList();

            return modules.Where(m => m.PriceIncluded).Select(m => m.Id).ToList();
        }
    }
}
