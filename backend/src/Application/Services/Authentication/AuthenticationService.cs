using Application.Abstractions.Authentication;
using Domain.Common.Enums;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Logging;

namespace Application.Services.Authentication
{
    public class AuthenticationService : IAuthenticationService
    {
        private readonly IUserRepository _userRepository;
        private readonly IHashPasswordService _hashPasswordService;
        private readonly ILogger<AuthenticationService> _logger;

        public AuthenticationService(
            IUserRepository userRepository,
            IHashPasswordService hashPasswordService,
            ILogger<AuthenticationService> logger)
        {
            _userRepository = userRepository;
            _hashPasswordService = hashPasswordService;
            _logger = logger;
        }

        public async Task<Result<Guid>> IsValidUserAsync(string login, string password)
        {
            User? user = await _userRepository.GetByLoginWithRelatedAsync(login);
            if (user is null)
            {
                _logger.LogWarning("Login failed for {Login}: user not found", login);
                return Result.Failure<Guid>(UserErrors.InvalidCredentials);
            }

            if (!user.IsActive)
            {
                _logger.LogWarning("Login failed for {Login}: user is inactive", login);
                return Result.Failure<Guid>(UserErrors.AccountInactive);
            }

            if (!_hashPasswordService.VerifyPassword(password, user.Password))
            {
                _logger.LogWarning("Login failed for {Login}: invalid password", login);
                return Result.Failure<Guid>(UserErrors.InvalidCredentials);
            }

            ReSeller? reSeller = user.ReSeller;
            if (reSeller != null)
            {
                if (!reSeller.IsActive)
                {
                    _logger.LogWarning("Login failed for {Login}: reseller is inactive", login);
                    return Result.Failure<Guid>(UserErrors.AccountInactive);
                }
                return Result.Success(user.Id);
            }

            Owner? owner = user.Owner;
            if (owner != null && !owner.IsActive)
            {
                _logger.LogWarning("Login failed for {Login}: owner is inactive", login);
                return Result.Failure<Guid>(UserErrors.AccountInactive);
            }

            Result isStoreActive = HasActiveStore(user);
            if (!isStoreActive.Succeeded)
            {
                _logger.LogWarning("Login failed for {Login}: no active store", login);
                return Result.Failure<Guid>(isStoreActive.Errors);
            }

            return Result.Success(user.Id);
        }

        private Result HasActiveStore(User user)
        {
            bool isGlobalAdmin = user.UserRoles?.Any(ur => ur.Role?.Id == (int)RoleType.SuperAdmin) ?? false;
            if (isGlobalAdmin)
                return Result.Success();

            bool isStoreAdmin = user.UserRoles?.Any(ur => ur.Role?.Id == (int)RoleType.OwnerAdmin) ?? false;
            if (isStoreAdmin)
            {
                // TODO (multi-store): When a store admin can manage multiple stores,
                // replace the simplified check below with the original multi-store query:
                // var stores = await _storeRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(user.Id);
                // return stores.Any() ? Result.Success() : StoreErrors.Inactive;
                if (user.StoreUser?.Store is not { } store)
                    return StoreErrors.Inactive;

                bool hasActiveStore = store.IsActive
                    && store.Owner?.IsActive == true;
                return hasActiveStore ? Result.Success() : StoreErrors.Inactive;
            }

            var storeUser = user.StoreUser;
            if (storeUser is null)
                return StoreErrors.Inactive;

            if (!storeUser.IsActive)
                return StoreErrors.Inactive;

            if (storeUser.Store is not { } activeStore)
                return StoreErrors.Inactive;

            if (!activeStore.IsActive)
                return StoreErrors.Inactive;

            if (activeStore.Owner is not { } owner)
                return StoreErrors.Inactive;

            if (!owner.IsActive)
                return StoreErrors.Inactive;

            return Result.Success();
        }
    }
}
