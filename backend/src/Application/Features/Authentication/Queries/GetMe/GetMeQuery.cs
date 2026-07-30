using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
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
using Application.Abstractions.Authentication;
using System.IdentityModel.Tokens.Jwt;

namespace Application.Features.Authentication.Queries.GetMe
{
    public sealed record GetMeQuery() : IQuery<CurrentUserDto> { }

    public class GetMeQueryHandler : IQueryHandler<GetMeQuery, CurrentUserDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IStoreRoleFeatureRepository _storeRoleFeatureRepository;
        private readonly IAllowedFeaturesService _allowedFeaturesService;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IBillingService _billingService;
        private readonly IDateTimeProvider _dateTimeProvider;
        private readonly ITokenBlacklistService _tokenBlacklistService;

        public GetMeQueryHandler(IHttpContextService httpContextService, IUserRepository userRepository, IStoreRoleFeatureRepository storeRoleFeatureRepository,
            IAllowedFeaturesService allowedFeaturesService, IStoreModuleRepository storeModuleRepository,
            IBillingService billingService,
            IDateTimeProvider dateTimeProvider,
            ITokenBlacklistService tokenBlacklistService)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _storeRoleFeatureRepository = storeRoleFeatureRepository;
            _allowedFeaturesService = allowedFeaturesService;
            _storeModuleRepository = storeModuleRepository;
            _billingService = billingService;
            _dateTimeProvider = dateTimeProvider;
            _tokenBlacklistService = tokenBlacklistService;
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
                await BlacklistCurrentTokenAsync();
                return ResponseResult.Failure<CurrentUserDto>(UserErrors.AccountInactive, (int)HttpStatusCode.NotFound);
            }

            var storeModules = await _storeModuleRepository.GetAvailableModulesByStoreIdAsync(user.SelectedStoreId);
            var billing = await _billingService.GetStoreBillingSummaryAsync(user.SelectedStoreId);
            List<int> storeModuleIds = StoreBillingUtils.FilterForBilling(storeModules, billing);

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


            return ResponseResult.Success(new CurrentUserDto
            {
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
                IsInTrial = billing.IsInTrial,
                PaymentStatus = billing.Status.ToString(),
            });
        }

        private async Task BlacklistCurrentTokenAsync()
        {
            var accessToken = _httpContextService.AccessToken;
            if (string.IsNullOrEmpty(accessToken)) return;

            try
            {
                var handler = new JwtSecurityTokenHandler();
                var jsonToken = handler.ReadJwtToken(accessToken);
                var jti = jsonToken.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti)?.Value;

                if (!string.IsNullOrEmpty(jti))
                {
                    var expClaim = jsonToken.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Exp)?.Value;
                    if (!string.IsNullOrEmpty(expClaim) && long.TryParse(expClaim, out var expSeconds))
                    {
                        var expDate = DateTimeOffset.FromUnixTimeSeconds(expSeconds);
                        var remaining = expDate - DateTimeOffset.UtcNow;
                        await _tokenBlacklistService.BlacklistAsync(jti, remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero);
                    }
                }
            }
            catch
            {
                // Malformed token — skip blacklisting
            }
        }
    }

}
