using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Owners;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Owners.Queries.GetAllOwners
{
    public sealed record GetAllOwnersQuery(bool IncludeInactive) : IQuery<IEnumerable<OwnerDto>>
    { }

    public class GetAllOwnersQueryHandler : IQueryHandler<GetAllOwnersQuery, IEnumerable<OwnerDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IOwnerRepository _ownerRepository;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetAllOwnersQueryHandler(IHttpContextService httpContextService, IOwnerRepository ownerRepository,
            ISystemConfigurationRepository systemConfigurationRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _systemConfigurationRepository = systemConfigurationRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<OwnerDto>>> Handle(GetAllOwnersQuery query, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller))
                throw new ApiException(_localizer["Unauthorized"], HttpStatusCode.Forbidden);

            var userExternalId = _httpContextService.UserExternalId.ToGuid();
            if (userExternalId == Guid.Empty)
                throw new ApiException("Invalid reseller identity", HttpStatusCode.BadRequest);

            IReadOnlyCollection<Owner> owners = (_httpContextService.IsSuperAdmin
                ? await _ownerRepository.GetAllOwnersIncludingStoreModulesAsync(query.IncludeInactive, cancellationToken)
                : await _ownerRepository.GetReSellerOwnersIncludingStoreModulesAsync(userExternalId, query.IncludeInactive, cancellationToken))
                ?.ToList() ?? new List<Owner>();

            IEnumerable<OwnerDto> ownerDtos = _mapper.Map<IEnumerable<OwnerDto>>(owners).ToList();

            int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();
            EnrichNextDueDates(ownerDtos, owners, trialMonths);

            // Sort by the closest (earliest) next payment date across the owner's stores;
            // owners with no calculable payment date sort last (null keys).
            IEnumerable<OwnerDto> orderedDtos = ownerDtos
                .OrderBy(o => o.StoreModules.Any(m => m.NextDueDate.HasValue) ? 0 : 1)
                .ThenBy(o => o.StoreModules
                    .Where(m => m.NextDueDate.HasValue)
                    .Select(m => m.NextDueDate)
                    .Min());

            return ResponseResult.Success(orderedDtos.AsEnumerable());
        }

        private static void EnrichNextDueDates(IEnumerable<OwnerDto> ownerDtos, IReadOnlyCollection<Owner> owners, int trialMonths)
        {
            var storesById = owners
                .SelectMany(o => o.Stores)
                .ToDictionary(s => s.Id, s => s);

            var lastPaidBeforeDateByStoreId = storesById.Values.ToDictionary(
                s => s.Id,
                s => s.StorePayments
                    .OrderByDescending(sp => sp.PaymentBeforeDate)
                    .Select(sp => (DateOnly?)DateOnly.FromDateTime(sp.PaymentBeforeDate.UtcDateTime))
                    .FirstOrDefault());

            foreach (var ownerDto in ownerDtos)
            {
                foreach (var storeModule in ownerDto.StoreModules)
                {
                    if (storeModule.StoreId == Guid.Empty || !storesById.TryGetValue(storeModule.StoreId, out var store))
                        continue;

                    storeModule.NextDueDate = StoreBillingUtils.GetNextDueDate(
                        store.PaymentStartDate,
                        trialMonths,
                        lastPaidBeforeDateByStoreId[store.Id]);
                }
            }
        }
    }
}
