using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Utils;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;

namespace Application.Features.StoreManagement.Stores.Queries.GetStorePlan
{
    public sealed record GetStorePlanQuery(Guid Id) : IQuery<StorePlanDto> { }

    public class GetStorePlanQueryHandler : IQueryHandler<GetStorePlanQuery, StorePlanDto>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStorePaymentRepository _storePaymentRepository;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;
        private readonly IMapper _mapper;

        public GetStorePlanQueryHandler(
            IMapper mapper,
            IGetStoreByIdService storeByIdService,
            IStorePaymentRepository storePaymentRepository,
            ISystemConfigurationRepository systemConfigurationRepository)
        {
            _mapper = mapper;
            _storeByIdService = storeByIdService;
            _storePaymentRepository = storePaymentRepository;
            _systemConfigurationRepository = systemConfigurationRepository;
        }

        public async Task<ResponseResult<StorePlanDto>> Handle(GetStorePlanQuery query, CancellationToken cancellationToken)
        {
            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(query.Id);

            if (store is null)
                return ResponseResult.Failure<StorePlanDto>(StoreErrors.NotFound, 404);

            StorePlanDto storePlanDto = _mapper.Map<StorePlanDto>(store);

            // Next billing date — same computation as the to-collect/billing flows:
            // first due = activation + trial + 1 post-paid month; afterwards the
            // latest paid PaymentBeforeDate. Null when the billing clock never started.
            int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();
            var lastPayment = await _storePaymentRepository.GetLastByStoreIdAsync(store.Id);
            DateOnly? lastPaidBeforeDate = lastPayment is null
                ? null
                : DateOnly.FromDateTime(lastPayment.PaymentBeforeDate.UtcDateTime);
            storePlanDto.NextDueDate = StoreBillingUtils.GetNextDueDate(
                store.PaymentStartDate,
                trialMonths,
                lastPaidBeforeDate);

            return ResponseResult.Success(storePlanDto);
        }
    }
}