using Application.Abstractions.Messaging;
using Application.Dtos.UserManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;

namespace Application.Features.UserManagement.Users.Queries.GetUsersByStoreId
{
    public sealed record GetUsersByStoreIdQuery(Guid StoreId, bool IncludeInactive)
        : IQuery<IEnumerable<UserListDto>> { }

    public class GetUsersByStoreIdQueryHandler : IQueryHandler<GetUsersByStoreIdQuery, IEnumerable<UserListDto>>
    {
        private readonly IUserRepository _userRepository;
        private readonly IMapper _mapper;

        public GetUsersByStoreIdQueryHandler(IUserRepository userRepository, IMapper mapper)
        {
            _userRepository = userRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<IEnumerable<UserListDto>>> Handle(GetUsersByStoreIdQuery query, CancellationToken cancellationToken)
        {
            var users = await _userRepository.GetAllUsersByStoreIdIncludingStoreAndRolesAsync(
                query.StoreId, query.IncludeInactive, cancellationToken);

            IEnumerable<UserListDto> userDtos = _mapper.Map<IEnumerable<UserListDto>>(users).ToList();
            return ResponseResult.Success(userDtos);
        }
    }
}
