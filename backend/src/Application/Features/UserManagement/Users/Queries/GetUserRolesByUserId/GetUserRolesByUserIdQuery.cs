using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Roles;
using Application.Dtos.Common;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.UserManagement.Users.Queries.GetUserRolesByUserId
{
    public sealed record GetUserRolesByUserIdQuery(Guid UserId) 
        : IQuery<IEnumerable<ListViewDto>> { }

    public class GetUserRolesByUserIdQueryHandler : IQueryHandler<GetUserRolesByUserIdQuery, IEnumerable<ListViewDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IRoleFilter _roleFilter;
        private readonly IMapper _mapper;
        private readonly IRoleRepository _roleRepository;
        private readonly IUserRepository _userRepository;
        private readonly IUserRoleRepository _userRoleRepository;

        public GetUserRolesByUserIdQueryHandler(
            IHttpContextService httpContextService,
            IRoleFilter roleFilter,
            IMapper mapper,
            IRoleRepository roleRepository,
            IUserRepository userRepository,
            IUserRoleRepository userRoleRepository)
        {
            _httpContextService = httpContextService;
            _roleFilter = roleFilter;
            _mapper = mapper;
            _roleRepository = roleRepository;
            _userRepository = userRepository;
            _userRoleRepository = userRoleRepository;
        }

        public async Task<ResponseResult<IEnumerable<ListViewDto>>> Handle(GetUserRolesByUserIdQuery query, CancellationToken cancellationToken)
        {
            var user = await _userRepository.GetByIdAsync(query.UserId);
            Guid tenantId = _httpContextService.TenantId.ToGuid();
            var activeRoles = await _roleRepository.GetAllActiveRolesAsync(tenantId, _httpContextService.IsSuperAdmin);
            var visibleRoles = _roleFilter.FilterVisibleRolesByCurrentUser(activeRoles);
            IEnumerable<ListViewDto> listViewDtos = _mapper.Map<IEnumerable<ListViewDto>>(visibleRoles);
            var activeRolesInUser = await _userRoleRepository.GetActiveRoleIdsByUser(user.Id);
            foreach (var role in listViewDtos)
                role.Selected = activeRolesInUser.Any(r => r.ToString() == role.Id);
            return await Task.FromResult(ResponseResult.Success(listViewDtos));
        }
    }
}
