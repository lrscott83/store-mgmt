using Application.Abstractions.Authentication;
using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Management.Users.Queries.ExportOfflineRoster
{
    public sealed record ExportOfflineRosterQuery(Guid StoreId) : IQuery<OfflineRosterDto> { }

    public class ExportOfflineRosterQueryHandler : IQueryHandler<ExportOfflineRosterQuery, OfflineRosterDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IAllowedFeaturesService _allowedFeaturesService;
        private readonly IOfflineVerifierService _offlineVerifierService;
        private readonly IStringLocalizer<I18n> _localizer;

        public ExportOfflineRosterQueryHandler(
            IHttpContextService httpContextService,
            IStoreUserRepository storeUserRepository,
            IStoreRepository storeRepository,
            IStoreModuleRepository storeModuleRepository,
            IStoreRoleFeatureRepository storeRoleFeatureRepository,
            IUserRoleRepository userRoleRepository,
            IAllowedFeaturesService allowedFeaturesService,
            IOfflineVerifierService offlineVerifierService,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeUserRepository = storeUserRepository;
            _storeRepository = storeRepository;
            _storeModuleRepository = storeModuleRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _userRoleRepository = userRoleRepository;
            _allowedFeaturesService = allowedFeaturesService;
            _offlineVerifierService = offlineVerifierService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<OfflineRosterDto>> Handle(ExportOfflineRosterQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            if (!_httpContextService.IsSuperAdmin)
            {
                var ownedStores = await _storeRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(
                    _httpContextService.UserExternalId.ToGuid());
                if (!ownedStores.Any(s => s.Id == query.StoreId))
                    throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);
            }

            var storeModules = await _storeModuleRepository.GetStoreModulesByIdAsync(query.StoreId);
            var storeModuleIds = storeModules.Select(sm => sm.ModuleId).ToList();

            var storeUsers = (await _storeUserRepository.GetStoreUsersByStoreIdAsync(query.StoreId, includeInactive: true)).ToList();

            var rosterUsers = new List<OfflineRosterUserDto>(storeUsers.Count);
            foreach (var su in storeUsers)
            {
                var roleFeatures = await _storeRoleFeatureRepository.GetStoreRoleFeaturesByUserIdAsync(su.UserId, storeModuleIds);
                var roles = roleFeatures
                    .GroupBy(srf => new { srf.Store, srf.Feature.Module })
                    .Select(g => new StoreModuleFeaturesDto(
                        g.Key.Store.Id,
                        g.Key.Store.Name,
                        g.Key.Module.Id,
                        g.Select(srf => srf.Feature.Id).ToList()
                    ))
                    .ToList<StoreModuleFeaturesDto>();

                var featureIds = await _allowedFeaturesService.GetAllowedFeatureIdsForUserAsync(su.UserId, storeModuleIds);

                var isSuperAdmin = await _userRoleRepository.IsSuperAdmin(su.UserId);
                var isOwnerAdmin = await _userRoleRepository.IsStoreAdmin(su.UserId);
                var isReSeller = await _userRoleRepository.IsReSeller(su.UserId);

                var verifier = _offlineVerifierService.CreateVerifier(su.User.Password);

                rosterUsers.Add(new OfflineRosterUserDto
                {
                    Id = su.UserId,
                    Login = su.User.Login,
                    FullName = su.User.FullName,
                    IsActive = su.User.IsActive,
                    Roles = roles,
                    FeatureIds = featureIds,
                    StoreModuleIds = storeModuleIds,
                    IsSuperAdmin = isSuperAdmin,
                    IsOwnerAdmin = isOwnerAdmin,
                    IsReSeller = isReSeller,
                    SelectedStoreId = su.User.SelectedStoreId,
                    Verifier = new OfflineVerifierDto
                    {
                        Hash = verifier.Hash,
                        Salt = verifier.Salt,
                        Iterations = verifier.Iterations
                    }
                });
            }

            var now = DateTimeOffset.UtcNow;
            var dto = new OfflineRosterDto
            {
                BundleId = Guid.NewGuid().ToString(),
                IssuedAt = now.ToUnixTimeMilliseconds(),
                ExpiresAt = now.AddDays(35).ToUnixTimeMilliseconds(),
                FormatVersion = 1,
                StoreId = query.StoreId,
                Users = rosterUsers
            };

            return ResponseResult.Success(dto);
        }
    }
}
