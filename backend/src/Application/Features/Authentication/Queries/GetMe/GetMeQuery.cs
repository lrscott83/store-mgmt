using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using System.Net;
using Domain.Common.Extensions;
using Microsoft.EntityFrameworkCore;
using Application.Abstractions.Features;

namespace Application.Features.Authentication.Queries.GetMe
{
    public sealed record GetMeQuery() : IQuery<CurrentUserDto> { }

    public class GetMeQueryHandler : IQueryHandler<GetMeQuery, CurrentUserDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IAllowedFeaturesService _allowedFeaturesService;
        private readonly IStoreModuleRepository _storeModuleRepositorytory;

        public GetMeQueryHandler(IHttpContextService httpContextService, IUserRepository userRepository, IStoreRoleFeatureRepository storeRoleFeatureRepository,
            IAllowedFeaturesService allowedFeaturesService, IStoreModuleRepository storeModuleRepositorytory)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _allowedFeaturesService = allowedFeaturesService;
            _storeModuleRepositorytory = storeModuleRepositorytory;
        }

        public async Task<ResponseResult<CurrentUserDto>> Handle(GetMeQuery request, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(_httpContextService.UserExternalId))
                return ResponseResult.Failure<CurrentUserDto>(UserErrors.NotFound, (int)HttpStatusCode.NotFound);
            
            var user = await _userRepository
                .Where(user => user.Id == _httpContextService.UserExternalId.ToGuid())
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
            
            if (user is null)
                return ResponseResult.Failure<CurrentUserDto>(UserErrors.NotFound, (int)HttpStatusCode.NotFound);

            if (!user.IsActive)
            {
                await _httpContextService.SignOutAsync();
                return ResponseResult.Failure<CurrentUserDto>(UserErrors.Inactive, (int)HttpStatusCode.NotFound);
            }

            var storeRoleFeatures = await _storeRoleFeatureRepository.GetStoreRoleFeaturesByUserIdAsync(user.Id);
            var storeRoleFeaturesDtos = storeRoleFeatures
                .GroupBy(srf => new { srf.Store, srf.Feature.Module })
                .Select(g => new StoreModuleFeaturesDto(
                    g.Key.Store.Id,
                    g.Key.Store.Name,
                    g.Key.Module.Id,
                    g.Select(srf => srf.Feature.Id).ToList()
            )).ToList();
            var featureIds = await _allowedFeaturesService.GetAllowedFeatureIdsForCurrentUserAsync();
            var storeModules = await _storeModuleRepositorytory.GetAvailableModulesByStoreIdAsync(user.SelectedStoreId);

            return ResponseResult.Success(new CurrentUserDto { 
                Id = user.Id, 
                Login = user.Login,
                Email = user.Email,
                FullName = user.FullName,
                CellPhone = user.CellPhone,
                Roles = storeRoleFeaturesDtos,
                FeatureIds = featureIds,
                IsSuperAdmin = _httpContextService.IsSuperAdmin,
                IsOwnerAdmin = _httpContextService.IsOwnerAdmin,
                IsReSeller = _httpContextService.IsReSeller,
                SelectedStoreId = user.SelectedStoreId,
                StoreModuleIds = storeModules.Select(module => module.Id).ToList(),
                IsActive = user.IsActive,
            });
        }
    }

}
