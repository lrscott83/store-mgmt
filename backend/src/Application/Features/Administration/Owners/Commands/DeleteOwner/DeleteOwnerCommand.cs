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
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
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
            IStoreRoleFeatureRepository storeRoleFeatureRepository)
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
        }


        public async Task<ResponseResult<bool>> Handle(DeleteOwnerCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.BadRequest);

            Owner owner = await _ownerRepository.GetOwnerWithAllDataToDeleteByIdAsync(request.Id);
            if (owner == null)
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.NotFound);

            // Hard delete: physically removes all data (not soft delete)
            // Order matters: FK_Owner_User_UserId is RESTRICT, so Owner must be
            // deleted BEFORE User. Leaf tables first, then parents.
            if (owner.ReSellerOwner != null)
                await _reSellerOwnerRepository.HardDeleteAsync(owner.ReSellerOwner);

            if (owner.User != null)
            {
                if (owner.User.UserRoles?.Any() == true)
                    await _userRoleRepository.HardDeleteAsync(owner.User.UserRoles);
                if (owner.User.StoreUsages?.Any() == true)
                    await _storeUsageRepository.HardDeleteAsync(owner.User.StoreUsages);
            }

            if (owner.Stores?.Any() == true)
            {
                var storeUsers = owner.Stores.SelectMany(s => (ICollection<StoreUser>?)s.StoreUsers ?? Enumerable.Empty<StoreUser>()).ToList();
                if (storeUsers.Any())
                    await _storeUserRepository.HardDeleteAsync(storeUsers);

                var storeModules = owner.Stores.SelectMany(s => (ICollection<StoreModule>?)s.StoreModules ?? Enumerable.Empty<StoreModule>()).ToList();
                if (storeModules.Any())
                    await _storeModuleRepository.HardDeleteAsync(storeModules);

                var storeRoleFeatures = owner.Stores.SelectMany(s => (ICollection<StoreRoleFeature>?)s.StoreRoleFeatures ?? Enumerable.Empty<StoreRoleFeature>()).ToList();
                if (storeRoleFeatures.Any())
                    await _storeRoleFeatureRepository.HardDeleteAsync(storeRoleFeatures);

                await _storeRepository.HardDeleteAsync(owner.Stores);
            }

            // Owner BEFORE User (FK_Owner_User_UserId RESTRICT)
            await _ownerRepository.HardDeleteAsync(owner);
            if (owner.User != null)
                await _userRepository.HardDeleteAsync(owner.User);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
