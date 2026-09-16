using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
using Application.Dtos.Management.Usages;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.StoreUsages;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Management.Usages.Queries.GetStoreLastWeekUsages
{
    public sealed record GetStoreLastUsagesQuery(int LastDays) : IQuery<StoreUsagesDto> {}

    public class GetStoreLastWeekUsagesQueryHandler : IQueryHandler<GetStoreLastUsagesQuery, StoreUsagesDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreUsageRepository _storeUsageRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IDateTimeProvider _dateTimeProvider;

        public GetStoreLastWeekUsagesQueryHandler(IHttpContextService httpContextService, IStoreUsageRepository storeUsageRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer, IStoreRepository storeRepository, IDateTimeProvider dateTimeProvider)
        {
            _httpContextService = httpContextService;
            _storeUsageRepository = storeUsageRepository;
            _storeRepository = storeRepository;
            _mapper = mapper;
            _localizer = localizer;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<ResponseResult<StoreUsagesDto>> Handle(GetStoreLastUsagesQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            // Dense-bucket contract (usage-dashboard-alignment): EXACTLY LastDays buckets,
            // one per calendar day from (today - (LastDays-1)) to today inclusive. Days
            // without usage (including today when nobody has connected yet) get an explicit
            // 0 and an empty owners list, so the frontend maps buckets 1:1 onto day labels
            // with no index shift. The window is LastDays days wide (not LastDays+1).
            DateTime todayUtc = _dateTimeProvider.UtcNow.UtcDateTime.Date;
            DateTime lastWeekDay = todayUtc.AddDays(-1 * (query.LastDays - 1));

            IEnumerable<StoreUsage> storeUsages = await _storeUsageRepository.GetStoresUsagesAfterDateWithOwnerAsync(lastWeekDay);
            // Deduplicate per store per day in memory so a store with several users on the
            // same day counts once, while the navigation chain Store → Owner → User stays
            // loaded for the owner names.
            var storeDayGroups = storeUsages
                .GroupBy(usage => new { usage.StoreId, usage.Day })
                .Select(group => group.First())
                .ToList();
            var byDay = storeDayGroups
                .GroupBy(usage => usage.Day)
                .ToDictionary(group => group.Key, group => group.ToList());

            List<int> usagesCount = new List<int>(query.LastDays);
            List<IList<string>> ownerNamesPerDay = new List<IList<string>>(query.LastDays);
            for (DateTime day = lastWeekDay; day <= todayUtc; day = day.AddDays(1))
            {
                if (byDay.TryGetValue(day, out var dayUsages))
                {
                    usagesCount.Add(dayUsages.Count);
                    ownerNamesPerDay.Add(dayUsages
                        .Select(usage => usage.Store?.Owner?.User?.FullName)
                        .Where(name => !string.IsNullOrWhiteSpace(name))
                        .Distinct()
                        .OrderBy(name => name)
                        .ToList());
                }
                else
                {
                    usagesCount.Add(0);
                    ownerNamesPerDay.Add(new List<string>());
                }
            }

            int activeStoreCount = await _storeRepository.GetActiveStoreCountAsync();
            return ResponseResult.Success(new StoreUsagesDto(usagesCount, activeStoreCount)
            {
                OwnerNamesPerDay = ownerNamesPerDay
            });
        }
    }
}
