using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Common;
using Application.Features.UserManagement.Users.Queries.GetUserRolesByUserId;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.UserRoles;
using Domain.Interfaces.Repositories;
using MediatR;

namespace Application.Features.UserManagement.Users.Commands.AddUserRoles
{
    public sealed record AddUserRolesCommand(Guid UserId, IEnumerable<int> RoleIds) 
        : ICommand<IEnumerable<ListViewDto>> { }

    public class AddUserRolesCommandHandler : ICommandHandler<AddUserRolesCommand, IEnumerable<ListViewDto>>
    {
        private readonly IMediator _mediator;
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        public AddUserRolesCommandHandler(
            IMediator mediator,
            IHttpContextService httpContextService,
            IUserRepository userRepository,
            IUserRoleRepository userRoleRepository,
            IApplicationUnitOfWork applicationUnitOfWork)
        {
            _mediator = mediator;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _userRoleRepository = userRoleRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
        }

        public async Task<ResponseResult<IEnumerable<ListViewDto>>> Handle(AddUserRolesCommand request, CancellationToken cancellationToken)
        {
            var user = await _userRepository.GetByIdAsync(request.UserId);
            Guid tenantId = _httpContextService.TenantId.ToGuid();
            var userRoles = _userRoleRepository.Where(ur => ur.UserId == request.UserId);
            foreach (var roleId in request.RoleIds)
            {
                UserRole userRole = userRoles.FirstOrDefault(x => x.RoleId == roleId);
                if (userRole == null)
                {
                    userRole = UserRole.Create(user.Id, roleId, tenantId);
                    await _userRoleRepository.AddAsync(userRole);
                }
                else if (!userRole.IsActive)
                {
                    userRole.IsActive = true;
                    await _userRoleRepository.UpdateAsync(userRole);
                }
            }

            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return await _mediator.Send(new GetUserRolesByUserIdQuery(request.UserId));
        }
    }
}
