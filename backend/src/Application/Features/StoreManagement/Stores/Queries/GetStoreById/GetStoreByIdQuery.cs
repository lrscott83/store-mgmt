using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;

namespace Application.Features.StoreManagement.Stores.Queries.GetStoreById
{
    public sealed record GetStoreByIdQuery(Guid Id) : IQuery<StoreDto> { }

    public class GetStoreByIdQueryHandler : IQueryHandler<GetStoreByIdQuery, StoreDto>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IMapper _mapper;

        public GetStoreByIdQueryHandler(
            IMapper mapper,
            IGetStoreByIdService storeByIdService)
        {
            _mapper = mapper;
            _storeByIdService = storeByIdService;
        }

        public async Task<ResponseResult<StoreDto>> Handle(GetStoreByIdQuery query, CancellationToken cancellationToken)
        {
            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(query.Id);

            if (store is null)
                return ResponseResult.Failure<StoreDto>(StoreErrors.NotFound, 404);

            StoreDto storeDto = _mapper.Map<StoreDto>(store);
            return ResponseResult.Success(storeDto);
        }
    }
}
