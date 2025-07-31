using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Management.Usages;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.StoreUsages;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Management.Usages.Commands.UpdateStoreDailyUsage
{
    public sealed record UpdateStoreDailyUsageCommand(IEnumerable<DailyUsageRequest> ActiveDays) : ICommand<bool>
    {
    }
    public class UpdateStoreDailyUsageCommandHandler : ICommandHandler<UpdateStoreDailyUsageCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IStoreUsageRepository _storeUsageRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateStoreDailyUsageCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreUsageRepository storeUsageRepository,
            IUserRepository userRepository,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _storeUsageRepository = storeUsageRepository;
            _userRepository = userRepository;
            _storeRepository = storeRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateStoreDailyUsageCommand request, CancellationToken cancellationToken)
        {
            Guid userId = _httpContextService.UserExternalId.ToGuid();
            if (await _userRepository.GetByIdAsync(userId) == null)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (await _storeRepository.GetByIdAsync(storeId) == null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<StoreUsage> usages = await _storeUsageRepository.GetStoreUsageByStoreIdAndUserId(userId, storeId);
            IEnumerable<DateTime> usageDays = usages.Select(usage => usage.Day);
            List<DateTime> days = request.ActiveDays.Select(day => DateTime.SpecifyKind(DateTime.Parse(day.Day), DateTimeKind.Utc)).ToList();
            days = days.Where(day => !usageDays.Contains(day)).ToList();
            foreach (var day in days)
            {
                StoreUsage storeUsage = StoreUsage.Create(storeId, userId, day, _httpContextService.IPAddress ?? "",
                    _httpContextService.GfDevice ?? "", _httpContextService.GfDeviceId ?? "", _httpContextService.GfSessionId ?? "");
                await _storeUsageRepository.AddAsync(storeUsage);
            }
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
