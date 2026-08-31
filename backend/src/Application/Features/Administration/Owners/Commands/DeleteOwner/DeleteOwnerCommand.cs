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
            _logger = logger;
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

            // Hard delete: leaf tables → parents. Each step guarded by null checks.
            if (owner.ReSellerOwner != null)
            {
                _logger.LogDebug("DeleteOwner: deleting ReSellerOwner");
                await _reSellerOwnerRepository.HardDeleteAsync(owner.ReSellerOwner);
            }

            if (owner.User != null)
            {
                if (owner.User.UserRoles?.Any() == true)
                {
                    _logger.LogDebug("DeleteOwner: deleting {Count} UserRoles", owner.User.UserRoles.Count);
                    await _userRoleRepository.HardDeleteAsync(owner.User.UserRoles);
                }
                // Delete StoreUsages by UserId (covers all stores this user touched)
                _logger.LogDebug("DeleteOwner: deleting StoreUsages for User {userId}", owner.User.Id);
                await _storeUsageRepository.HardDeleteWhereAsync(su => su.UserId == owner.User.Id);
            }

            if (owner.Stores?.Any() == true)
            {
                // StoreUser/StoreModule/StoreRoleFeature have composite PKs —
                // HardDeleteAsync only handles single-PK. Use HardDeleteWhereAsync.
                var storeIds = owner.Stores.Select(s => s.Id).ToList();
                foreach (var storeId in storeIds)
                {
                    _logger.LogDebug("DeleteOwner: deleting StoreUsers for Store {storeId}", storeId);
                    await _storeUserRepository.HardDeleteWhereAsync(su => su.StoreId == storeId);

                    _logger.LogDebug("DeleteOwner: deleting StoreModules for Store {storeId}", storeId);
                    await _storeModuleRepository.HardDeleteWhereAsync(sm => sm.StoreId == storeId);

                    _logger.LogDebug("DeleteOwner: deleting StoreRoleFeatures for Store {storeId}", storeId);
                    await _storeRoleFeatureRepository.HardDeleteWhereAsync(srf => srf.StoreId == storeId);

                    _logger.LogDebug("DeleteOwner: deleting StoreUsages for Store {storeId}", storeId);
                    await _storeUsageRepository.HardDeleteWhereAsync(su => su.StoreId == storeId);
                }

                _logger.LogDebug("DeleteOwner: deleting {Count} Stores", owner.Stores.Count);
                await _storeRepository.HardDeleteAsync(owner.Stores);
            }

            // Owner BEFORE User (FK_Owner_User_UserId RESTRICT)
            _logger.LogDebug("DeleteOwner: deleting Owner");
            await _ownerRepository.HardDeleteAsync(owner);

            if (owner.User != null)
            {
                _logger.LogDebug("DeleteOwner: deleting User");
                await _userRepository.HardDeleteAsync(owner.User);
            }

            _logger.LogInformation("DeleteOwner: saving changes for owner {OwnerId}", owner.Id);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
