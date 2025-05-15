using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;

namespace Application.Features.StoreManagement.Stores.Queries.GetStoreById
{
    public sealed record GetStoreByIdQuery(Guid Id) : IQuery<StoreDto> { }

    public class GetAllStoresQueryHandler : IQueryHandler<GetStoreByIdQuery, StoreDto>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IMapper _mapper;

        public GetAllStoresQueryHandler(
            IMapper mapper,
            IGetStoreByIdService storeByIdService)
        {
            _mapper = mapper;
            _storeByIdService = storeByIdService;
        }

        public async Task<ResponseResult<StoreDto>> Handle(GetStoreByIdQuery query, CancellationToken cancellationToken)
        {
            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(query.Id);
            StoreDto storeDto = _mapper.Map<StoreDto>(store);
            return await Task.FromResult(ResponseResult.Success(storeDto));
        }
    }
}
