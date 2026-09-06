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
    public sealed record GetStoreLastUsagesQuery(int LastDays) : IQuery<StoreUsagesDto> {}

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
            _mapper = mapper;
            _localizer = localizer;
            _storeRepository = storeRepository;
        }

        public async Task<ResponseResult<StoreUsagesDto>> Handle(GetStoreLastUsagesQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            DateTime lastWeekDay = DateTime.UtcNow.Date.AddDays(-1 * query.LastDays);
            IEnumerable<StoreUsage> storeUsages = await _storeUsageRepository.GetStoresUsagesAfterDateWithOwnerAsync(lastWeekDay);
            // Deduplicate per store per day in memory (mirrors the repository's legacy
            // SQL GROUP BY) so the counts stay identical while the navigation chain
            // Store → Owner → User remains loaded for the owner names.
            var storeDayGroups = storeUsages
                .GroupBy(usage => new { usage.StoreId, usage.Day })
                .Select(group => group.First())
                .ToList();
            var groups = storeDayGroups
                .GroupBy(usage => usage.Day)
                .OrderBy(group => group.Key)
                .ToList();
            List<int> usagesCount = groups.Select(group => group.Count()).ToList();
            List<IList<string>> ownerNamesPerDay = groups
                .Select(group => (IList<string>)group
                    .Select(usage => usage.Store?.Owner?.User?.FullName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Distinct()
                    .OrderBy(name => name)
                    .ToList())
                .ToList();
            while (usagesCount.Count < query.LastDays)
            {
                usagesCount.Insert(0, 0);
                ownerNamesPerDay.Insert(0, new List<string>());
            }
            int activeStoreCount = await _storeRepository.GetActiveStoreCountAsync();
            return ResponseResult.Success(new StoreUsagesDto(usagesCount, activeStoreCount)
            {
                OwnerNamesPerDay = ownerNamesPerDay
            });
        }
    }
}
