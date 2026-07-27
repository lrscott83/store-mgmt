using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using System.Net;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Microsoft.EntityFrameworkCore;
using Application.Abstractions.Features;

namespace Application.Features.Authentication.Queries.GetMe
{
    public sealed record GetMeQuery() : IQuery<CurrentUserDto> { }

    public class GetMeQueryHandler : IQueryHandler<GetMeQuery, CurrentUserDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IAllowedFeaturesService _allowedFeaturesService;
        private readonly IStoreModuleRepository _storeModuleRepositorytory;
        private readonly IBillingService _billingService;

        public GetMeQueryHandler(IHttpContextService httpContextService, IUserRepository userRepository, IStoreRoleFeatureRepository storeRoleFeatureRepository,
            IAllowedFeaturesService allowedFeaturesService, IStoreModuleRepository storeModuleRepositorytory,
            IBillingService billingService)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _allowedFeaturesService = allowedFeaturesService;
            _storeModuleRepositorytory = storeModuleRepositorytory;
            _billingService = billingService;
        }

        public async Task<ResponseResult<CurrentUserDto>> Handle(GetMeQuery request, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(_httpContextService.UserExternalId))
                return ResponseResult.Failure<CurrentUserDto>(UserErrors.NotFound, (int)HttpStatusCode.NotFound);
            
            var user = await _userRepository
                .Where(user => user.Id == _httpContextService.UserExternalId.ToGuid())
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
            
            if (user is null)
                return ResponseResult.Failure<CurrentUserDto>(UserErrors.NotFound, (int)HttpStatusCode.NotFound);

            if (!user.IsActive)
            {
                await _httpContextService.SignOutAsync();
                return ResponseResult.Failure<CurrentUserDto>(UserErrors.Inactive, (int)HttpStatusCode.NotFound);
            }

            var storeModules = await _storeModuleRepositorytory.GetAvailableModulesByStoreIdAsync(user.SelectedStoreId);
            var billing = await _billingService.GetStoreBillingSummaryAsync(user.SelectedStoreId);
            List<int> storeModuleIds = FilterForBilling(storeModules, billing);

            var storeRoleFeatures = await _storeRoleFeatureRepository.GetStoreRoleFeaturesByUserIdAsync(user.Id, storeModuleIds);
            var storeRoleFeaturesDtos = storeRoleFeatures
                .GroupBy(srf => new { srf.Store, srf.Feature.Module })
                .Select(g => new StoreModuleFeaturesDto(
                    g.Key.Store.Id,
                    g.Key.Store.Name,
                    g.Key.Module.Id,
                    g.Select(srf => srf.Feature.Id).ToList()
            )).ToList();

            var featureIds = await _allowedFeaturesService.GetAllowedFeatureIdsForCurrentUserAsync(storeModuleIds);
            

            var today = DateOnly.FromDateTime(DateTime.UtcNow);

            return ResponseResult.Success(new CurrentUserDto { 
                Id = user.Id, 
                Login = user.Login,
                Email = user.Email,
                FullName = user.FullName,
                CellPhone = user.CellPhone,
                Roles = storeRoleFeaturesDtos,
                FeatureIds = featureIds,
                IsSuperAdmin = _httpContextService.IsSuperAdmin,
                IsOwnerAdmin = _httpContextService.IsOwnerAdmin,
                IsReSeller = _httpContextService.IsReSeller,
                SelectedStoreId = user.SelectedStoreId,
                StoreModuleIds = storeModuleIds,
                IsActive = user.IsActive,
                PaymentDueDate = billing.NextDueDate,
                IsInTrial = billing.PaymentStartDate is not null && billing.PaymentStartDate.Value.AddMonths(1) >= today,
                PaymentStatus = billing.Status.ToString(),
            });
        }

        /// <summary>
        /// Filters modules based on the store's billing status.
        /// Free plan (NoAplica) → all modules accessible.
        /// Active paid plan (AlDia, PorVencer, EnGracia) → all modules accessible.
        /// Overdue (Vencido) → only free (PriceIncluded) modules accessible.
        /// </summary>
        internal static List<int> FilterForBilling(IEnumerable<Module> modules, StoreBillingSummary billing)
        {
            // No active billing → no enforcement
            if (billing.Status == StoreBillingStatusType.NoAplica)
                return modules.Select(m => m.Id).ToList();

            // Paid plan that is active or in grace → all modules
            if (billing.Status != StoreBillingStatusType.Vencido)
                return modules.Select(m => m.Id).ToList();

            // Overdue past grace → only free (PriceIncluded) modules
            return modules.Where(m => m.PriceIncluded).Select(m => m.Id).ToList();
        }
    }

}
