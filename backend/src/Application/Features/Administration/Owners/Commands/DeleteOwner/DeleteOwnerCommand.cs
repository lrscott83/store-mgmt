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
                await _reSellerOwnerRepository.HardDeleteAsync(owner.ReSellerOwner);

            // 2. UserRoles
            if (owner.User?.UserRoles != null && owner.User.UserRoles.Any())
                await _userRoleRepository.HardDeleteAsync(owner.User.UserRoles);

            // 3. StoreUsages (by user)
            if (owner.User?.StoreUsages != null && owner.User.StoreUsages.Any())
                await _storeUsageRepository.HardDeleteAsync(owner.User.StoreUsages);

            // 4. Per-store children — only if Stores collection is loaded
            if (owner.Stores != null)
            {
                foreach (var store in owner.Stores)
                {
                    if (store.StoreUsers != null && store.StoreUsers.Any())
                        await _storeUserRepository.HardDeleteAsync(store.StoreUsers);

                    if (store.StoreModules != null && store.StoreModules.Any())
                        await _storeModuleRepository.HardDeleteAsync(store.StoreModules);

                    if (store.StoreRoleFeatures != null && store.StoreRoleFeatures.Any())
                        await _storeRoleFeatureRepository.HardDeleteAsync(store.StoreRoleFeatures);

                    if (store.StoreUsages != null && store.StoreUsages.Any())
                        await _storeUsageRepository.HardDeleteAsync(store.StoreUsages);

                    await _storeRepository.HardDeleteAsync(store);
                }
            }

            // 5. Owner BEFORE User
            await _ownerRepository.HardDeleteAsync(owner);

            // 6. User
            if (owner.User != null)
                await _userRepository.HardDeleteAsync(owner.User);

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
