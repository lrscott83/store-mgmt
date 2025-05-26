using Domain.Common.Enums;
using Domain.Interfaces.Repositories;
using Microsoft.AspNetCore.Mvc;
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

        public HasUserPermissionRequirementFilter(StoreRoleFeatures[] storeRoleFeatures,
            IStoreRoleFeatureRepository storeRoleFeatureRepository, IHttpContextService httpContextService,
            IReSellerRepository reSellerRepository, IAllowedFeaturesService allowedFeaturesService, IStoreModuleRepository storeModuleRepositorytory)
        {
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _httpContextService = httpContextService;
            _reSellerRepository = reSellerRepository;
            _storeRoleFeatures = storeRoleFeatures.ToList();
            _allowedFeaturesService = allowedFeaturesService;
            _storeModuleRepositorytory = storeModuleRepositorytory;
        }

        public void OnAuthorization(AuthorizationFilterContext context)
        {
            var currentUserId = _httpContextService?.UserExternalId;
            if (!string.IsNullOrEmpty(currentUserId))
            {
                // if user is not Super Admin, find out if it has any other authorized roles
                if (!_httpContextService.IsSuperAdmin)
                {
                    var storeModules = _storeModuleRepositorytory.GetAvailableModulesByStoreIdAsync(_httpContextService.StoreId.ToGuid()).Result;
                    List<int> storeModuleIds = storeModules.Select(module => module.Id).ToList();
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
                context.Result = new ForbidResult();
            }
        }
    }
}
