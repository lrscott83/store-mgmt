using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Stores;
using Domain.Interfaces.Services.Stores;

namespace Application.Features.StoreManagement.Stores.Queries.GetStorePlan
{
    public sealed record GetStorePlanQuery(Guid Id) : IQuery<StorePlanDto> { }

    public class GetStorePlanQueryHandler : IQueryHandler<GetStorePlanQuery, StorePlanDto>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IMapper _mapper;

        public GetStorePlanQueryHandler(
            IMapper mapper,
            IGetStoreByIdService storeByIdService)
        {
            _mapper = mapper;
            _storeByIdService = storeByIdService;
        }

        public async Task<ResponseResult<StorePlanDto>> Handle(GetStorePlanQuery query, CancellationToken cancellationToken)
        {
            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(query.Id);

            if (store is null)
                return ResponseResult.Failure<StorePlanDto>(StoreErrors.NotFound, 404);

            StorePlanDto storePlanDto = _mapper.Map<StorePlanDto>(store);
            return ResponseResult.Success(storePlanDto);
        }
    }
}
