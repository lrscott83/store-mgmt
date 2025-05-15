using Application.Abstractions.Messaging;
using Application.Dtos.UserManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;

namespace Application.Features.UserManagement.Users.Queries.GetUserById
{
    public sealed record GetUserByIdQuery(Guid UserId) : IQuery<UserDto> { }

    public class GetUserByIdQueryHandler : IQueryHandler<GetUserByIdQuery, UserDto>
    {
        private readonly IUserRepository _userRepository;
        private readonly IMapper _mapper;

        public GetUserByIdQueryHandler(IUserRepository userRepository, IMapper mapper)
        {
            _userRepository = userRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<UserDto>> Handle(GetUserByIdQuery query, CancellationToken cancellationToken)
        {
            User user = await _userRepository.GetUserByIdIncludingStoreAndRoles(query.UserId);
            UserDto userDto = _mapper.Map<UserDto>(user);
            return ResponseResult.Success(userDto);
        }
    }
}
