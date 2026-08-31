using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System;
using System.Linq;
using System.Net;
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
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.NotFound);

            _logger.LogInformation("DeleteOwner: {OwnerId}", owner.Id);

            try
            {
                if (owner.ReSellerOwner != null)
                {
                    _logger.LogDebug("DeleteOwner: ReSellerOwner");
                    await _reSellerOwnerRepository.HardDeleteAsync(owner.ReSellerOwner);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED ReSellerOwner. Inner: {Inner}", ex.InnerException?.Message);
                throw;
            }

            try
            {
                if (owner.User?.UserRoles != null && owner.User.UserRoles.Any())
                {
                    _logger.LogDebug("DeleteOwner: UserRoles count={Count}", owner.User.UserRoles.Count);
                    await _userRoleRepository.HardDeleteAsync(owner.User.UserRoles);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED UserRoles. Inner: {Inner}", ex.InnerException?.Message);
                throw;
            }

            try
            {
                if (owner.User?.StoreUsages != null && owner.User.StoreUsages.Any())
                {
                    _logger.LogDebug("DeleteOwner: User.StoreUsages count={Count}", owner.User.StoreUsages.Count);
                    await _storeUsageRepository.HardDeleteAsync(owner.User.StoreUsages);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED User.StoreUsages. Inner: {Inner}", ex.InnerException?.Message);
                throw;
            }

            if (owner.Stores != null)
            {
                foreach (var store in owner.Stores)
                {
                    try
                    {
                        _logger.LogDebug("DeleteOwner: Store {StoreId} StoreUsers={Count}, StoreModules={Count2}, StoreRoleFeatures={Count3}",
                            store.Id,
                            store.StoreUsers?.Count ?? -1,
                            store.StoreModules?.Count ?? -1,
                            store.StoreRoleFeatures?.Count ?? -1);

                        if (store.StoreUsers != null && store.StoreUsers.Any())
                            await _storeUserRepository.HardDeleteAsync(store.StoreUsers);

                        if (store.StoreModules != null && store.StoreModules.Any())
                            await _storeModuleRepository.HardDeleteAsync(store.StoreModules);

                        if (store.StoreRoleFeatures != null && store.StoreRoleFeatures.Any())
                            await _storeRoleFeatureRepository.HardDeleteAsync(store.StoreRoleFeatures);

                        if (store.StoreUsages != null && store.StoreUsages.Any())
                            await _storeUsageRepository.HardDeleteAsync(store.StoreUsages);

                        _logger.LogDebug("DeleteOwner: Store {StoreId} children OK", store.Id);
                        await _storeRepository.HardDeleteAsync(store);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "DeleteOwner: FAILED at Store {StoreId}. Inner: {Inner}", store.Id, ex.InnerException?.Message);
                        throw;
                    }
                }
            }

            try
            {
                _logger.LogDebug("DeleteOwner: Owner");
                await _ownerRepository.HardDeleteAsync(owner);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED Owner. Inner: {Inner}", ex.InnerException?.Message);
                throw;
            }

            try
            {
                if (owner.User != null)
                {
                    _logger.LogDebug("DeleteOwner: User");
                    await _userRepository.HardDeleteAsync(owner.User);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteOwner: FAILED User. Inner: {Inner}", ex.InnerException?.Message);
                throw;
            }

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
