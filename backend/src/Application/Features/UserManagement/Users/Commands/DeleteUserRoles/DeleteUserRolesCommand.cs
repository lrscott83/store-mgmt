using Application.Abstractions.Messaging;
using Application.Dtos.Common;
using Application.Features.UserManagement.Users.Queries.GetUserRolesByUserId;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using MediatR;

namespace Application.Features.UserManagement.Users.Commands.DeleteUserRoles
{
    public sealed record DeleteUserRolesCommand(Guid UserId, IEnumerable<int> RoleIds) 
        : ICommand<IEnumerable<ListViewDto>> { }

public class RemoveUserRolesCommandHandler : ICommandHandler<DeleteUserRolesCommand, IEnumerable<ListViewDto>>
    {
        private readonly IMediator _mediator;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        public RemoveUserRolesCommandHandler(
            IMediator mediator,
            IUserRoleRepository userRoleRepository,
            IApplicationUnitOfWork applicationUnitOfWork)
        {
            _mediator = mediator;
            _userRoleRepository = userRoleRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
        }

        public async Task<ResponseResult<IEnumerable<ListViewDto>>> Handle(DeleteUserRolesCommand request, CancellationToken cancellationToken)
        {
            var userRolesToDelete = await _userRoleRepository.GetActiveUserRolesByIds(request.UserId, request.RoleIds.ToHashSet());
            await _userRoleRepository.DeleteAsync(userRolesToDelete);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            return await _mediator.Send(new GetUserRolesByUserIdQuery(request.UserId));
        }
    }
}
