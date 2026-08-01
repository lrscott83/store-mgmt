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
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        public AddUserRolesCommandHandler(
            IMediator mediator,
            IHttpContextService httpContextService,
            IUserRoleRepository userRoleRepository,
            IApplicationUnitOfWork applicationUnitOfWork)
        {
            _mediator = mediator;
            _httpContextService = httpContextService;
            _userRoleRepository = userRoleRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
        }

        public async Task<ResponseResult<IEnumerable<ListViewDto>>> Handle(AddUserRolesCommand request, CancellationToken cancellationToken)
        {
            Guid tenantId = _httpContextService.TenantId.ToGuid();
            var userRoles = (await _userRoleRepository.GetByUserIdAsync(request.UserId, cancellationToken))
                .ToDictionary(ur => ur.RoleId);
            foreach (var roleId in request.RoleIds.Distinct())
            {
                if (!userRoles.TryGetValue(roleId, out var userRole))
                {
                    userRole = UserRole.Create(request.UserId, roleId, tenantId);
                    await _userRoleRepository.AddAsync(userRole);
                }
                else if (!userRole.IsActive)
                {
                    userRole.IsActive = true;
                }
            }

            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return await _mediator.Send(new GetUserRolesByUserIdQuery(request.UserId));
        }
    }
}
