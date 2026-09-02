using Application.Abstractions.Authentication;
using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
using Application.Dtos.Authentication;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
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
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IAllowedFeaturesService _allowedFeaturesService;
        private readonly IOfflineVerifierService _offlineVerifierService;
        private readonly IStoreKeyWrapService _storeKeyWrapService;
        private readonly IStoreDataKeyProvider _storeDataKeyProvider;
        private readonly IOfflinePreHashProtector _preHashProtector;
        private readonly IDateTimeProvider _dateTimeProvider;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;
        private readonly IBillingService _billingService;
        private readonly IJwtProvider _jwtProvider;
        private readonly IStringLocalizer<I18n> _localizer;

        private const int FormatVersion = 3;

        public ExportOfflineRosterQueryHandler(
            IHttpContextService httpContextService,
            IStoreUserRepository storeUserRepository,
            IStoreRepository storeRepository,
            IOwnerRepository ownerRepository,
            IStoreModuleRepository storeModuleRepository,
            IStoreRoleFeatureRepository storeRoleFeatureRepository,
            IUserRoleRepository userRoleRepository,
            IAllowedFeaturesService allowedFeaturesService,
            IOfflineVerifierService offlineVerifierService,
            IStoreKeyWrapService storeKeyWrapService,
            IStoreDataKeyProvider storeDataKeyProvider,
            IOfflinePreHashProtector preHashProtector,
            IDateTimeProvider dateTimeProvider,
            ISystemConfigurationRepository systemConfigurationRepository,
            IBillingService billingService,
            IJwtProvider jwtProvider,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeUserRepository = storeUserRepository;
            _storeRepository = storeRepository;
            _ownerRepository = ownerRepository;
            _storeModuleRepository = storeModuleRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _userRoleRepository = userRoleRepository;
            _allowedFeaturesService = allowedFeaturesService;
            _offlineVerifierService = offlineVerifierService;
            _storeKeyWrapService = storeKeyWrapService;
            _storeDataKeyProvider = storeDataKeyProvider;
            _preHashProtector = preHashProtector;
            _dateTimeProvider = dateTimeProvider;
            _systemConfigurationRepository = systemConfigurationRepository;
            _billingService = billingService;
            _jwtProvider = jwtProvider;
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
            var billing = await _billingService.GetStoreBillingSummaryAsync(query.StoreId);
            List<int> storeModuleIds = StoreBillingUtils.FilterForBilling(storeModules.Select(sm => sm.Module), billing);

            var storeUsers = (await _storeUserRepository.GetStoreUsersByStoreIdAsync(query.StoreId, includeInactive: true)).ToList();

            // Include the store owner in the roster if not already present as a StoreUser.
            // The owner is linked via the Owner entity, not StoreUser, so they would be
            // missing from the roster — preventing offline authentication.
            var store = await _storeRepository.GetStoreByIdAsync(query.StoreId);
            if (store is not null)
            {
                var ownerAlreadyIncluded = storeUsers.Any(su => su.UserId == store.OwnerId);
                if (!ownerAlreadyIncluded)
                {
                    var owner = await _ownerRepository.GetOwnerIncludingUserByIdAsync(store.OwnerId);
                    if (owner?.User != null)
                    {
                        var syntheticStoreUser = Domain.Entities.StoreUsers.StoreUser.Create(
                            owner.User.Id, query.StoreId, store.TenantId);
                        syntheticStoreUser.User = owner.User;
                        storeUsers.Add(syntheticStoreUser);
                    }
                }
            }

            var dek = _storeDataKeyProvider.GetDek(query.StoreId);

            // Roster expiry is computed up front: each user's offline auth token
            // (JWT) must share exactly the same lifetime as the bundle, so a
            // token can never outlive the roster that carried it.
            int ttlDays = await _systemConfigurationRepository.GetOfflineRosterTtlDaysAsync();
            var now = _dateTimeProvider.UtcNow;
            var expiresAt = now.UtcDateTime.AddDays(ttlDays);

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

                var preHash = _preHashProtector.Unprotect(su.User.OfflinePasswordPreHash, su.UserId);
                var verifier = preHash is null ? null : _offlineVerifierService.CreateVerifier(preHash);
                var wrapped = preHash is null ? null : _storeKeyWrapService.WrapDek(preHash, dek);

                // Mint the offline auth token valid until the roster expires. May be
                // empty only if token generation fails; the frontend falls back to the
                // offline-session sentinel when absent (legacy bundles / failure).
                string offlineAuthToken;
                try
                {
                    offlineAuthToken = _jwtProvider.GenerateToken(su.UserId, su.User.Login, expiresAt);
                }
                catch
                {
                    offlineAuthToken = string.Empty;
                }

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
                    Verifier = verifier is null ? null : new OfflineVerifierDto
                    {
                        Hash = verifier.Hash,
                        Salt = verifier.Salt,
                        Iterations = verifier.Iterations
                    },
                    WrappedDek = wrapped?.WrappedDek ?? string.Empty,
                    WrapSalt = wrapped?.WrapSalt ?? string.Empty,
                    WrapIv = wrapped?.WrapIv ?? string.Empty,
                    PaymentDueDate = billing.NextDueDate,
                    IsInTrial = billing.IsInTrial,
                    PaymentStatus = billing.Status.ToString(),
                    WrapIterations = wrapped?.Iterations ?? 0,
                    OfflineAuthToken = offlineAuthToken
                });
            }

            var dto = new OfflineRosterDto
            {
                BundleId = Guid.NewGuid().ToString(),
                IssuedAt = now.ToUnixTimeMilliseconds(),
                ExpiresAt = now.AddDays(ttlDays).ToUnixTimeMilliseconds(),
                FormatVersion = FormatVersion,
                StoreId = query.StoreId,
                Users = rosterUsers
            };

            return ResponseResult.Success(dto);
        }
    }
}
