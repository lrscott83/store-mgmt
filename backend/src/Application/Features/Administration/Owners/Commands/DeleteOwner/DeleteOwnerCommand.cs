using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreUsers;
using Domain.Entities.StoreUsages;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Administration.Owners.Commands.DeleteOwner
{
    public sealed record DeleteOwnerCommand(Guid Id) : ICommand<bool> { }

    public class DeleteOwnerCommandHandler : ICommandHandler<DeleteOwnerCommand, bool>
    {
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IStoreUsageRepository _storeUsageRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IUserRepository _userRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<DeleteOwnerCommandHandler> _logger;

        public DeleteOwnerCommandHandler(
            IOwnerRepository ownerRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IStoreRepository storeRepository,
            IUserRepository userRepository,
            IReSellerOwnerRepository reSellerOwnerRepository,
            IUserRoleRepository userRoleRepository,
            IStoreUsageRepository storeUsageRepository,
            IStoreModuleRepository storeModuleRepository,
            IStoreRoleFeatureRepository storeRoleFeatureRepository,
            ILogger<DeleteOwnerCommandHandler> logger)
        {
            _ownerRepository = ownerRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
            _storeRepository = storeRepository;
            _userRepository = userRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
            _userRoleRepository = userRoleRepository;
            _storeUsageRepository = storeUsageRepository;
            _storeModuleRepository = storeModuleRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _logger = logger;
        }


        public async Task<ResponseResult<bool>> Handle(DeleteOwnerCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.BadRequest);

            Owner owner = await _ownerRepository.GetOwnerWithAllDataToDeleteByIdAsync(request.Id);
            if (owner == null)
            {
                _logger.LogWarning("DeleteOwner: owner {OwnerId} not found", request.Id);
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.NotFound);
            }

            _logger.LogInformation("DeleteOwner: deleting owner {OwnerId} (User={HasUser}, Stores={StoreCount}, ReSellerOwner={HasRSO})",
                owner.Id, owner.User != null, owner.Stores?.Count ?? 0, owner.ReSellerOwner != null);

            try
            {
                // Step 1: ReSellerOwner
                if (owner.ReSellerOwner != null)
                {
                    _logger.LogDebug("DeleteOwner: step 1 - deleting ReSellerOwner");
                    await _reSellerOwnerRepository.HardDeleteAsync(owner.ReSellerOwner);
                    _logger.LogDebug("DeleteOwner: step 1 - OK");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED at step 1 (ReSellerOwner)");
                throw;
            }

            try
            {
                // Step 2: UserRoles
                if (owner.User?.UserRoles?.Any() == true)
                {
                    _logger.LogDebug("DeleteOwner: step 2 - deleting {Count} UserRoles", owner.User.UserRoles.Count);
                    await _userRoleRepository.HardDeleteAsync(owner.User.UserRoles);
                    _logger.LogDebug("DeleteOwner: step 2 - OK");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED at step 2 (UserRoles)");
                throw;
            }

            try
            {
                // Step 3: StoreUsages by UserId
                if (owner.User != null)
                {
                    _logger.LogDebug("DeleteOwner: step 3 - deleting StoreUsages for User {userId}", owner.User.Id);
                    await _storeUsageRepository.HardDeleteWhereAsync(su => su.UserId == owner.User.Id);
                    _logger.LogDebug("DeleteOwner: step 3 - OK");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED at step 3 (StoreUsages by UserId)");
                throw;
            }

            try
            {
                // Step 4: StoreUsers, StoreModules, StoreRoleFeatures per store
                if (owner.Stores?.Any() == true)
                {
                    var storeIds = owner.Stores.Select(s => s.Id).ToList();
                    foreach (var storeId in storeIds)
                    {
                        _logger.LogDebug("DeleteOwner: step 4a - deleting StoreUsers for Store {storeId}", storeId);
                        await _storeUserRepository.HardDeleteWhereAsync(su => su.StoreId == storeId);
                        _logger.LogDebug("DeleteOwner: step 4a - OK");

                        _logger.LogDebug("DeleteOwner: step 4b - deleting StoreModules for Store {storeId}", storeId);
                        await _storeModuleRepository.HardDeleteWhereAsync(sm => sm.StoreId == storeId);
                        _logger.LogDebug("DeleteOwner: step 4b - OK");

                        _logger.LogDebug("DeleteOwner: step 4c - deleting StoreRoleFeatures for Store {storeId}", storeId);
                        await _storeRoleFeatureRepository.HardDeleteWhereAsync(srf => srf.StoreId == storeId);
                        _logger.LogDebug("DeleteOwner: step 4c - OK");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED at step 4 (StoreUsers/Modules/RoleFeatures)");
                throw;
            }

            try
            {
                // Step 5: Stores
                if (owner.Stores?.Any() == true)
                {
                    _logger.LogDebug("DeleteOwner: step 5 - deleting {Count} Stores", owner.Stores.Count);
                    await _storeRepository.HardDeleteAsync(owner.Stores);
                    _logger.LogDebug("DeleteOwner: step 5 - OK");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED at step 5 (Stores)");
                throw;
            }

            try
            {
                // Step 6: Owner (BEFORE User — FK_Owner_User_UserId RESTRICT)
                _logger.LogDebug("DeleteOwner: step 6 - deleting Owner");
                await _ownerRepository.HardDeleteAsync(owner);
                _logger.LogDebug("DeleteOwner: step 6 - OK");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED at step 6 (Owner)");
                throw;
            }

            try
            {
                // Step 7: User
                if (owner.User != null)
                {
                    _logger.LogDebug("DeleteOwner: step 7 - deleting User");
                    await _userRepository.HardDeleteAsync(owner.User);
                    _logger.LogDebug("DeleteOwner: step 7 - OK");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED at step 7 (User)");
                throw;
            }

            _logger.LogInformation("DeleteOwner: saving changes for owner {OwnerId}", owner.Id);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
