using Application.Abstractions.Authentication;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;

namespace Application.Services.Owners
{
    public class CreateOwnerService : ICreateOwnerService
    {
        private readonly IUserRepository _userRepository;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IHashPasswordService _hashPasswordService;
        private readonly ITenantRepository _tenantRepository;

        public CreateOwnerService(IUserRepository userRepository, IOwnerRepository ownerRepository, 
            IUserRoleRepository userRoleRepository, IHashPasswordService hashPasswordService, 
            ITenantRepository tenantRepository)
        {
            _userRepository = userRepository;
            _ownerRepository = ownerRepository;
            _userRoleRepository = userRoleRepository;
            _hashPasswordService = hashPasswordService;
            _tenantRepository = tenantRepository;
        }

        
        public async Task<Owner> CreateOwnerAsync(string login, string password, string fullName, string cellPhone, 
            string? email, string? description)
        {
            Tenant tenant = Tenant.Create(login, "", DateTime.UtcNow, "");
            await _tenantRepository.AddAsync(tenant);

            string passwordHashed = _hashPasswordService.HashPassword(password);
            var user = User.Create(login, passwordHashed, fullName, cellPhone, email, tenant.Id);
            await _userRepository.AddAsync(user);

            // Guest is always false for admin-created owners (OwnerAdmin/ReSeller).
            // The entity default (true) applies only to self-registered users.
            var owner = Owner.Create(user.Id, false, tenant.Id, description ?? "");
            owner.User = user; // Assign navigation property for proper entity tracking
            await _ownerRepository.AddAsync(owner);

            var userRole = UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenant.Id);
            await _userRoleRepository.AddAsync(userRole);

            return owner;
        }
    }
}
