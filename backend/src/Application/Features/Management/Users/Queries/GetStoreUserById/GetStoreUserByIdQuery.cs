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

namespace Application.Features.Management.StoreUsers.Queries.GetStoreUserById
{
    public sealed record GetStoreUserByIdQuery(Guid StoreUserId) : IQuery<StoreUserDto> { }

    public class GetStoreUserByIdQueryHandler : IQueryHandler<GetStoreUserByIdQuery, StoreUserDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreUserByIdQueryHandler(IHttpContextService httpContextService, IStoreUserRepository storeUserRepository, 
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _storeUserRepository = storeUserRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreUserDto>> Handle(GetStoreUserByIdQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            StoreUser storeUser = _httpContextService.IsSuperAdmin
                ? await _storeUserRepository.GetStoreUserByIdIgnoreQueryFilterAsync(query.StoreUserId)
                : await _storeUserRepository.GetStoreUserByIdAsync(query.StoreUserId);
            StoreUserDto storeUserDto = _mapper.Map<StoreUserDto>(storeUser);
            return ResponseResult.Success(storeUserDto);
        }
    }
}
