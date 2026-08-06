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
        private readonly IOfflinePreHashProtector _preHashProtector;
        private readonly ILogger<AuthenticationService> _logger;

        public AuthenticationService(
            IUserRepository userRepository,
            IHashPasswordService hashPasswordService,
            IOfflinePreHashProtector preHashProtector,
            ILogger<AuthenticationService> logger)
        {
            _userRepository = userRepository;
            _hashPasswordService = hashPasswordService;
            _preHashProtector = preHashProtector;
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

            if (user.OfflinePasswordPreHash is null)
            {
                try
                {
                    string envelope = _preHashProtector.Protect(password, user.Id);
                    await _userRepository.SetOfflinePasswordPreHashIfNullAsync(user.Id, envelope, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    // A backfill failure must never turn a valid login into a 500 — the pre-hash
                    // is filled opportunistically; the user retries offline-provisioning on next login.
                    _logger.LogWarning(ex, "Offline pre-hash backfill failed for {Login}", login);
                }
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
                // An owner reaches their store through the Owner relationship. Self
                // registration creates Owner + Store and sets SelectedStoreId
                // (RegisterCommand.cs:91); it never creates a StoreUser row, because
                // StoreUser is the employee table. Resolving an owner's store through
                // user.StoreUser therefore rejected every self-registered owner with
                // 403 Store.Inactive — registration returned 201 and the account could
                // never authenticate.
                //
                // This mirrors the predicate of
                // StoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync:
                // Owner.IsActive AND Store.IsActive, matched by Owner.UserId. It already
                // reads a collection, so it holds unchanged once an owner may run more
                // than one store.
                if (user.Owner is not { } ownerAccount || !ownerAccount.IsActive)
                    return StoreErrors.Inactive;

                bool hasActiveStore = ownerAccount.Stores?.Any(s => s.IsActive) == true;
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
