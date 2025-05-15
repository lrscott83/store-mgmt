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

        public AllowedFeaturesService(IHttpContextService httpContextService, IFeatureRepository featureRepository)
        {
            _httpContextService = httpContextService;
            _featureRepository = featureRepository;
        }

        public async Task<List<int>> GetAllowedFeatureIdsForCurrentUserAsync()
        {
            if (_httpContextService.IsReSeller)
                return await GetAllowedFeatureIdsByRoleAsync(RoleType.ReSeller);
            if (_httpContextService.IsOwnerAdmin)
                return await GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin);
            return [];
        }

        private async Task<List<int>> GetAllowedFeatureIdsByRoleAsync(RoleType role)
        {
            List<int> allowedFeatureIds = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
                        .Where(roleFeature => roleFeature.GetRoles().Any(r => r == role) && roleFeature.GetFeatureType().HasValue)
                        .Select(roleFeature => (int)roleFeature.GetFeatureType().Value)
                        .ToList();
            return await _featureRepository.FilterAvailableToStoreByIds(allowedFeatureIds);
        }
    }
}
