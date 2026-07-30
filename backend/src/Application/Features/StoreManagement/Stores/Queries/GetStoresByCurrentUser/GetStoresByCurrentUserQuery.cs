using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Constants;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.AspNetCore.Http;

namespace Application.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser
{
    public sealed record GetStoresByCurrentUserQuery() : IQuery<IEnumerable<StoreDto>> { }

    public class GetStoresByCurrentUserQueryHandler : IQueryHandler<GetStoresByCurrentUserQuery, IEnumerable<StoreDto>>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IMapper _mapper;
        private readonly IHttpContextService _httpContextService;

        public GetStoresByCurrentUserQueryHandler(
            IStoreRepository storeRepository,
            IMapper mapper,
            IHttpContextService httpContextService)
        {
            _storeRepository = storeRepository;
            _mapper = mapper;
            _httpContextService = httpContextService;
        }

        public async Task<ResponseResult<IEnumerable<StoreDto>>> Handle(GetStoresByCurrentUserQuery request, CancellationToken cancellationToken)
        {
            var userId = _httpContextService.UserExternalId.ToGuid();
            var stores = _httpContextService.IsSuperAdmin
                ? await _storeRepository.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(excludeStoreId: DataUtils.DefaultStore.Id)
                : await _storeRepository.GetActiveStoresByUserIdAsync(userId, excludeStoreId: DataUtils.DefaultStore.Id);
            var storeDtos = _mapper.Map<IEnumerable<StoreDto>>(stores);
            return ResponseResult.Success(storeDtos);
        }
    }
}
