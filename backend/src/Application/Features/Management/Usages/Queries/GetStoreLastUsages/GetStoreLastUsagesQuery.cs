using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
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
    /// <summary>
    /// Dashboard usage window. <paramref name="Today"/> is the viewer's own calendar day
    /// ("yyyy-MM-dd", required) — NOT the server's UTC date. See the handler for why.
    /// It stays a string so a missing/malformed value produces a 400 through the same
    /// FluentValidation pipeline (and therefore the same ApiResponse envelope) as every
    /// other validation failure, instead of ASP.NET's shape for a failed type bind.
    /// </summary>
    public sealed record GetStoreLastUsagesQuery(int LastDays, string? Today) : IQuery<StoreUsagesDto> {}

    public class GetStoreLastWeekUsagesQueryHandler : IQueryHandler<GetStoreLastUsagesQuery, StoreUsagesDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreUsageRepository _storeUsageRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreLastWeekUsagesQueryHandler(IHttpContextService httpContextService, IStoreUsageRepository storeUsageRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer, IStoreRepository storeRepository)
        {
            _httpContextService = httpContextService;
            _storeUsageRepository = storeUsageRepository;
            _storeRepository = storeRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreUsagesDto>> Handle(GetStoreLastUsagesQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            // Dense-bucket contract (usage-dashboard-alignment): EXACTLY LastDays buckets,
            // one per calendar day from (Today - (LastDays-1)) to Today inclusive. Days
            // without usage (including Today when nobody has connected yet) get an explicit
            // 0 and an empty owners list, so the frontend maps buckets 1:1 onto day labels
            // with no index shift. The window is LastDays days wide (not LastDays+1).
            //
            // Today is the CLIENT's calendar day, never UtcNow (client-local-day): a stored
            // StoreUsage.Day is a pure calendar day in each store's own local calendar (always
            // 00:00:00 UTC — the tracker sends "yyyy-MM-dd" built from local parts), so the
            // axis must be the viewer's calendar too. Anchoring on UtcNow made every viewer
            // behind UTC see a not-yet-happened day as "today" for the last hours of their
            // evening (from 19:00 local at UTC-5), shifting the whole chart one position left.
            // GetStoreLastUsagesQueryValidator guarantees the format before this line runs.
            //
            // Kind=Utc is mandatory, not cosmetic: the Day column is `timestamp with time
            // zone` and Npgsql refuses a Kind=Unspecified parameter outright. The stored
            // values are exactly midnight UTC, so the calendar day is carried by the tick
            // count and the Kind only has to be explicit.
            DateTime todayUtc = DateTime.SpecifyKind(
                ClientDay.Parse(query.Today).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
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
