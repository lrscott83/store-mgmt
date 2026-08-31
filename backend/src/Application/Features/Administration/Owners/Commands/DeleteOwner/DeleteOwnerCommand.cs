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

            // 1. ReSellerOwner
            if (owner.ReSellerOwner != null)
            {
                _logger.LogInformation("DeleteOwner: 1. ReSellerOwner");
                await _reSellerOwnerRepository.HardDeleteAsync(owner.ReSellerOwner);
                _logger.LogInformation("DeleteOwner: 1. OK");
            }

            // 2. UserRoles
            if (owner.User?.UserRoles != null && owner.User.UserRoles.Any())
            {
                _logger.LogInformation("DeleteOwner: 2. UserRoles count={Count}", owner.User.UserRoles.Count);
                await _userRoleRepository.HardDeleteAsync(owner.User.UserRoles);
                owner.User.UserRoles.Clear();
                _logger.LogInformation("DeleteOwner: 2. OK");
            }

            // 3. User.StoreUsages
            if (owner.User?.StoreUsages != null && owner.User.StoreUsages.Any())
            {
                _logger.LogInformation("DeleteOwner: 3. User.StoreUsages count={Count}", owner.User.StoreUsages.Count);
                await _storeUsageRepository.HardDeleteAsync(owner.User.StoreUsages);
                owner.User.StoreUsages.Clear();
                _logger.LogInformation("DeleteOwner: 3. OK");
            }

            // 4. Per-store children
            if (owner.Stores != null && owner.Stores.Any())
            {
                var storesList = owner.Stores.ToList();
                _logger.LogInformation("DeleteOwner: 4. Stores count={Count}", storesList.Count);

                foreach (var store in storesList)
                {
                    _logger.LogInformation("DeleteOwner: 4. Store {StoreId}", store.Id);

                    var su = store.StoreUsers?.ToList();
                    _logger.LogInformation("DeleteOwner: 4a. StoreUsers count={Count}", su?.Count ?? -1);
                    if (su != null && su.Any())
                    {
                        try
                        {
                            await _storeUserRepository.HardDeleteAsync(su);
                            _logger.LogInformation("DeleteOwner: 4a. OK");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "DeleteOwner: 4a. EXCEPTION. Entity0Type={Type}, UserId={UserId}, StoreId={StoreId}, RepoType={Repo}",
                                su[0]?.GetType().FullName ?? "NULL",
                                su[0]?.UserId ?? Guid.Empty,
                                su[0]?.StoreId ?? Guid.Empty,
                                _storeUserRepository.GetType().FullName);
                            throw;
                        }
                    }

                    var sm = store.StoreModules?.ToList();
                    _logger.LogInformation("DeleteOwner: 4b. StoreModules count={Count}", sm?.Count ?? -1);
                    if (sm != null && sm.Any())
                    {
                        await _storeModuleRepository.HardDeleteAsync(sm);
                        _logger.LogInformation("DeleteOwner: 4b. OK");
                    }

                    var srf = store.StoreRoleFeatures?.ToList();
                    _logger.LogInformation("DeleteOwner: 4c. StoreRoleFeatures count={Count}", srf?.Count ?? -1);
                    if (srf != null && srf.Any())
                    {
                        await _storeRoleFeatureRepository.HardDeleteAsync(srf);
                        _logger.LogInformation("DeleteOwner: 4c. OK");
                    }

                    var su2 = store.StoreUsages?.ToList();
                    _logger.LogInformation("DeleteOwner: 4d. Store.StoreUsages count={Count}", su2?.Count ?? -1);
                    if (su2 != null && su2.Any())
                    {
                        await _storeUsageRepository.HardDeleteAsync(su2);
                        _logger.LogInformation("DeleteOwner: 4d. OK");
                    }

                    _logger.LogInformation("DeleteOwner: 4e. Store itself");
                    await _storeRepository.HardDeleteAsync(store);
                    _logger.LogInformation("DeleteOwner: 4e. OK");
                }

                owner.Stores.Clear();
                _logger.LogInformation("DeleteOwner: 4. ALL OK");
            }

            // 5. Owner
            _logger.LogInformation("DeleteOwner: 5. Owner");
            await _ownerRepository.HardDeleteAsync(owner);
            _logger.LogInformation("DeleteOwner: 5. OK");

            // 6. User
            if (owner.User != null)
            {
                _logger.LogInformation("DeleteOwner: 6. User");
                await _userRepository.HardDeleteAsync(owner.User);
                _logger.LogInformation("DeleteOwner: 6. OK");
            }

            _logger.LogInformation("DeleteOwner: SAVING");
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
