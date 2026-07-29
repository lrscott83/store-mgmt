using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Services.Features
{
    public class AllowedFeaturesService : IAllowedFeaturesService
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IFeatureRepository _featureRepository;
        private readonly IUserRoleRepository _userRoleRepository;

        public AllowedFeaturesService(IHttpContextService httpContextService, IFeatureRepository featureRepository,
            IUserRoleRepository userRoleRepository)
        {
            _httpContextService = httpContextService;
            _featureRepository = featureRepository;
            _userRoleRepository = userRoleRepository;
        }

        public async Task<List<int>> GetAllowedFeatureIdsForCurrentUserAsync(List<int> storeModuleIds)
        {
            if (_httpContextService.IsReSeller)
                return await GetReSellerAllowedFeatureIdsByRoleAsync();
            if (_httpContextService.IsOwnerAdmin)
                return await GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin, storeModuleIds);
            return [];
        }

        public async Task<List<int>> GetAllowedFeatureIdsForUserAsync(Guid userId, List<int> storeModuleIds)
        {
            if (await _userRoleRepository.IsReSeller(userId))
                return await GetReSellerAllowedFeatureIdsByRoleAsync();
            if (await _userRoleRepository.IsStoreAdmin(userId))
                return await GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin, storeModuleIds);
            return [];
        }

        private async Task<List<int>> GetAllowedFeatureIdsByRoleAsync(RoleType role, List<int> storeModuleIds)
        {
            List<int> allowedFeatureIds = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
                        .Where(roleFeature => roleFeature.GetRoles().Any(r => r == role) && roleFeature.GetFeatureType().HasValue 
                            && roleFeature.GetModuleType().HasValue && storeModuleIds.Contains((int)roleFeature.GetModuleType().Value))
                        .Select(roleFeature => (int)roleFeature.GetFeatureType().Value)
                        .ToList();
            return await _featureRepository.FilterAvailableToStoreByIds(allowedFeatureIds);
        }

        private async Task<List<int>> GetReSellerAllowedFeatureIdsByRoleAsync()
        {
            List<int> allowedFeatureIds = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
                        .Where(roleFeature => roleFeature.GetRoles().Any(r => r == RoleType.ReSeller) && roleFeature.GetFeatureType().HasValue)
                        .Select(roleFeature => (int)roleFeature.GetFeatureType().Value)
                        .ToList();
            return allowedFeatureIds;
        }
    }
}
