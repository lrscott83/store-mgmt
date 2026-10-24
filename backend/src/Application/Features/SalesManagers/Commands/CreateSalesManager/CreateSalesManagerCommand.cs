using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Owners;
using Domain.Entities.SalesManagers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Commands.CreateSalesManager
{
    public sealed record CreateSalesManagerCommand(
        string Login,
        string Password,
        string FullName,
        string CellPhone,
        string? Email) : ICommand<bool>;

    /// <summary>
    /// Crea un gestor de ventas: User + UserRole 5 + SalesManager ligado al Owner autenticado.
    /// Es Owner-only y NO crea StoreUser ni tienda. La cuenta es Owner-level.
    /// </summary>
    public class CreateSalesManagerCommandHandler
        : ICommandHandler<CreateSalesManagerCommand, bool>
    {
        private readonly IApplicationUnitOfWork _unitOfWork;
        private readonly IUserRepository _userRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly ISalesManagerRepository _salesManagerRepository;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IHashPasswordService _hashPasswordService;

        public CreateSalesManagerCommandHandler(
            IApplicationUnitOfWork unitOfWork,
            IUserRepository userRepository,
            IUserRoleRepository userRoleRepository,
            ISalesManagerRepository salesManagerRepository,
            IOwnerRepository ownerRepository,
            IHttpContextService httpContextService,
            IHashPasswordService hashPasswordService)
        {
            _unitOfWork = unitOfWork;
            _userRepository = userRepository;
            _userRoleRepository = userRoleRepository;
            _salesManagerRepository = salesManagerRepository;
            _ownerRepository = ownerRepository;
            _httpContextService = httpContextService;
            _hashPasswordService = hashPasswordService;
        }

        public async Task<ResponseResult<bool>> Handle(
            CreateSalesManagerCommand request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException("Solo el Owner puede crear gestores de ventas.", HttpStatusCode.Forbidden);

            Guid ownerUserId = _httpContextService.UserExternalId.ToGuid();
            Owner? owner = await _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(ownerUserId);
            if (owner is null || !owner.IsActive)
                throw new ApiException("Owner no encontrado.", HttpStatusCode.Forbidden);

            if (string.IsNullOrWhiteSpace(request.Login)
                || string.IsNullOrWhiteSpace(request.Password)
                || string.IsNullOrWhiteSpace(request.FullName))
                throw new ApiException("Login, contraseña y nombre son obligatorios.", HttpStatusCode.BadRequest);

            if (!await _userRepository.IsUniqueLoginAsync(request.Login.Trim()))
                throw new ApiException("El login ya existe.", HttpStatusCode.BadRequest);

            string password = _hashPasswordService.HashPassword(request.Password);
            var user = User.Create(
                request.Login.Trim(),
                password,
                request.FullName.Trim(),
                request.CellPhone,
                request.Email,
                owner.TenantId);

            await _userRepository.AddAsync(user);

            var userRole = UserRole.Create(user.Id, (int)RoleType.GestorVentas, owner.TenantId);
            await _userRoleRepository.AddAsync(userRole);

            var salesManager = SalesManager.Create(user.Id, owner.Id, owner.TenantId);
            await _salesManagerRepository.AddAsync(salesManager);

            return ResponseResult.Success(await _unitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
