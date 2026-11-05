using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Management.Users.Commands.CreateStoreUser
{
    public sealed record CreateStoreUserCommand(Guid StoreId, string Login, string Password, string FullName, string? CellPhone, string? Email,
        IEnumerable<int> RoleIds)
        : ICommand<StoreUserDto>
    { }

    public class CreateStoreUserCommandHandler : ICommandHandler<CreateStoreUserCommand, StoreUserDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IStoreRepository _storeRepository;
        private readonly IUserRepository _userRepository;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IHashPasswordService _hashPasswordService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IOfflinePreHashProtector _preHashProtector;

        public CreateStoreUserCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IStoreRepository storeRepository,
            IUserRepository userRepository,
            IStoreUserRepository storeUserRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IUserRoleRepository userRoleRepository,
            IHashPasswordService hashPasswordService,
            IOfflinePreHashProtector preHashProtector)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _storeRepository = storeRepository;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _storeUserRepository = storeUserRepository;
            _localizer = localizer;
            _userRoleRepository = userRoleRepository;
            _hashPasswordService = hashPasswordService;
            _preHashProtector = preHashProtector;
        }

        public async Task<ResponseResult<StoreUserDto>> Handle(CreateStoreUserCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetByIdAsync(request.StoreId);
            string passwordHashed = _hashPasswordService.HashPassword(request.Password);
            var user = User.Create(request.Login, passwordHashed, request.FullName, request.CellPhone,
                request.Email, store.TenantId);
            user.SelectedStoreId = request.StoreId;
            user.OfflinePasswordPreHash = _preHashProtector.Protect(request.Password, user.Id);
            await _userRepository.AddAsync(user);

            var storeUser = StoreUser.Create(user.Id, store.Id, store.TenantId);
            await _storeUserRepository.AddAsync(storeUser);

            foreach (var roleId in request.RoleIds)
            {
                var userRole = UserRole.Create(user.Id, roleId, store.TenantId);
                await _userRoleRepository.AddAsync(userRole);
            }

            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            // The action declares a StoreUserDto, so it must return the created user, built from
            // the state this handler just persisted. `Id` is the owner of the created store-user
            // relationship: the repository resolves a store user by `UserId`
            // (StoreUserRepository.GetStoreUserByIdAsync), so the id is the one a GET accepts.
            return ResponseResult.Success(new StoreUserDto
            {
                Id = user.Id,
                StoreId = store.Id,
                Login = user.Login,
                FullName = user.FullName,
                CellPhone = user.CellPhone,
                Email = user.Email,
                IsActive = storeUser.IsActive,
            });
        }
    }
}
