using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
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
        : ICommand<bool>
    { }

    public class CreateStoreUserCommandHandler : ICommandHandler<CreateStoreUserCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IStoreRepository _storeRepository;
        private readonly IUserRepository _userRepository;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IHashPasswordService _hashPasswordService;
        private readonly IStringLocalizer<I18n> _localizer;

        public CreateStoreUserCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IStoreRepository storeRepository,
            IUserRepository userRepository,
            IStoreUserRepository storeUserRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IUserRoleRepository userRoleRepository,
            IHashPasswordService hashPasswordService)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _storeRepository = storeRepository;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _storeUserRepository = storeUserRepository;
            _localizer = localizer;
            _userRoleRepository = userRoleRepository;
            _hashPasswordService = hashPasswordService;
        }

        public async Task<ResponseResult<bool>> Handle(CreateStoreUserCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetByIdAsync(request.StoreId);
            string passwordHashed = _hashPasswordService.HashPassword(request.Password);
            var user = User.Create(request.Login, passwordHashed, request.FullName, request.CellPhone,
                request.Email, store.TenantId);
            user.SelectedStoreId = request.StoreId;
            await _userRepository.AddAsync(user);

            var storeUser = StoreUser.Create(user.Id, store.Id, store.TenantId);
            await _storeUserRepository.AddAsync(storeUser);

            foreach (var roleId in request.RoleIds)
            {
                var userRole = UserRole.Create(user.Id, roleId, store.TenantId);
                await _userRoleRepository.AddAsync(userRole);
            }

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
