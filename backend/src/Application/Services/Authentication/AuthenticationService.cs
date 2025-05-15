using Application.Abstractions.Authentication;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;

namespace Application.Services.Authentication
{
    public class AuthenticationService : IAuthenticationService
    {
        private readonly IUserRepository _userRepository;
        private readonly IHashPasswordService _hashPasswordService;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IReSellerRepository _resellerRepository;
        private readonly IOwnerRepository _ownerRepository;

        public AuthenticationService(IUserRepository userRepository,
            IHashPasswordService hashPasswordService,
            IUserRoleRepository userRoleRepository,
            IStoreRepository storeRepository,
            IStoreUserRepository storeUserRepository,
            IReSellerRepository reSellerRepository,
            IOwnerRepository ownerRepository)
        {
            _userRepository = userRepository;
            _hashPasswordService = hashPasswordService;
            _userRoleRepository = userRoleRepository;
            _storeRepository = storeRepository;
            _storeUserRepository = storeUserRepository;
            _resellerRepository = reSellerRepository;
            _ownerRepository = ownerRepository;
        }

        public async Task<Result<Guid>> IsValidUserAsync(string login, string password)
        {
            User user = await _userRepository.GetUserByLoginIgnoreQueryFiltersAsync(login);
            if (user is null)
                return Result.Failure<Guid>(UserErrors.LoginNotFound(login));

            if (!user.IsActive)
                return Result.Failure<Guid>(UserErrors.Inactive);

            string hashedPassword = _hashPasswordService.HashPassword(password);
            if (user.Password != hashedPassword)
                return Result.Failure<Guid>(UserErrors.InvalidPassword(login));

            ReSeller reSeller = await _resellerRepository.GetByUserIdIgnoreQueryFiltersAsync(user.Id);
            if (reSeller != null)
                return reSeller.IsActive ? Result.Success(user.Id) : Result.Failure<Guid>(ReSellerErrors.Inactive);

            Owner owner = await _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(user.Id);
            if (owner != null && !owner.IsActive)
                return Result.Failure<Guid>(OwnerErrors.Inactive);

            Result isStoreActive = await HasActiveStoreAsync(user);
            if (!isStoreActive.Succeeded)
                return Result.Failure<Guid>(isStoreActive.Errors);

            return Result.Success(user.Id);
        }

        private async Task<Result> HasActiveStoreAsync(User user)
        {
            var isGlobalAdmin = await _userRoleRepository.IsSuperAdmin(user.Id);
            if (isGlobalAdmin)
                return Result.Success();

            var isStoreAdmin = await _userRoleRepository.IsStoreAdmin(user.Id);
            if (isStoreAdmin)
            {
                var stores = await _storeRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(user.Id);
                return stores.Any() ? Result.Success() : StoreErrors.Inactive;
            }

            var store = await _storeUserRepository.GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(user.Id);
            return store != null && store.IsActive
                && store.User != null && store.User.IsActive
                && store.Store != null && store.Store.IsActive
                && store.Store.Owner != null && store.Store.Owner.IsActive ? Result.Success() : StoreErrors.Inactive;
        }
    }
}
