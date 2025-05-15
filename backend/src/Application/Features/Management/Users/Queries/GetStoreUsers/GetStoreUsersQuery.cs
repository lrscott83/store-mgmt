using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.StoreUsers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Management.Users.Queries.GetStoreUsers
{
    public sealed record GetStoreUsersQuery(bool IncludeInactive)
        : IQuery<IEnumerable<StoreUserDto>>
    { }

    public class GetStoreUsersQueryHandler : IQueryHandler<GetStoreUsersQuery, IEnumerable<StoreUserDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreUsersQueryHandler(IHttpContextService httpContextService, IStoreUserRepository storeUserRepository, 
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeUserRepository = storeUserRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<StoreUserDto>>> Handle(GetStoreUsersQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<StoreUser> storeUsers = _httpContextService.IsSuperAdmin
                ? await _storeUserRepository.GetStoreUsersIgnoreQueryFiltersAsync(query.IncludeInactive)
                : await _storeUserRepository.GetStoreUsersAsync(query.IncludeInactive);
            IEnumerable<StoreUserDto> storeUserDtos = _mapper.Map<IEnumerable<StoreUserDto>>(storeUsers).ToList();
            return ResponseResult.Success(storeUserDtos);
        }
    }
}
