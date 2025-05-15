using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;

namespace Application.Features.StoreManagement.Stores.Queries.GetStores
{
    public sealed record GetStoresQuery(bool IncludeInactive) : IQuery<IEnumerable<StoreDto>> { }

    public class GetStoresQueryHandler : IQueryHandler<GetStoresQuery, IEnumerable<StoreDto>>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IMapper _mapper;


        public GetStoresQueryHandler(
            IStoreRepository storeRepository,
            IMapper mapper)
        {
            _storeRepository = storeRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<IEnumerable<StoreDto>>> Handle(GetStoresQuery request, CancellationToken cancellationToken)
        {
            var stores = await _storeRepository.GetStoresAsync(request.IncludeInactive);
            var storeDtos = _mapper.Map<IEnumerable<StoreDto>>(stores);
            return ResponseResult.Success(storeDtos);
        }
    }
}
