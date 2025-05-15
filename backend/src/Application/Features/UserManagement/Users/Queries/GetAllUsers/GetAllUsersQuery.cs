using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Common;
using Application.Dtos.UserManagement;
using Application.Features.UserManagement.Users.Queries.GetUserRolesByUserId;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;

namespace Application.Features.UserManagement.Users.Queries.GetAllUsers
{
    public sealed record GetAllUsersQuery(bool IncludeInactive)
        : IQuery<IEnumerable<UserListDto>> { }

    public class GetAllUsersQueryHandler : IQueryHandler<GetAllUsersQuery, IEnumerable<UserListDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IMapper _mapper;

        public GetAllUsersQueryHandler(IHttpContextService httpContextService, IUserRepository userRepository, IMapper mapper)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<IEnumerable<UserListDto>>> Handle(GetAllUsersQuery query, CancellationToken cancellationToken)
        {
            IEnumerable<User> users = await FindUsersIncludingRoles(query.IncludeInactive);
            IEnumerable<UserListDto> userDtos = _mapper.Map<IEnumerable<UserListDto>>(users).ToList();
            return ResponseResult.Success(userDtos);
        }

        private async Task<IEnumerable<User>> FindUsersIncludingRoles(bool includeInactive)
        {
            if (_httpContextService.IsSuperAdmin)
                return await _userRepository.GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(includeInactive);

            return _httpContextService.IsOwnerAdmin
                ? await _userRepository.GetAllUsersIncludingStoreAndRolesAsync(includeInactive)
                : await _userRepository.GetAllUsersByStoreIdIncludingStoreAndRolesAsync(_httpContextService.StoreId.ToGuid(), includeInactive);
        }
    }
}
