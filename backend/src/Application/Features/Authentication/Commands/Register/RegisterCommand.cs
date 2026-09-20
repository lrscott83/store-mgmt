using Application.Abstractions.Authentication;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Entities.Plans;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System.Net;

namespace Application.Features.Authentication.Commands.Register
{
    public sealed record RegisterCommand(string Login, string Password, string FullName, string CellPhone, string? Email,
        string StoreName, string? Code)
        : ICommand<AuthDto>
    { }

    public class RegisterCommandHandler : ICommandHandler<RegisterCommand, AuthDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly ICreateOwnerService _createOwnerService;
        private readonly ICreateStoreService _createStoreService;
        private readonly IPlanRepository _planRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly IJwtProvider _jwtProvider;
        private readonly IAuthTokenConfig _authTokenConfig;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<RegisterCommandHandler> _logger;

        public RegisterCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IStringLocalizer<I18n> localizer,
            ICreateOwnerService createOwnerService,
            ICreateStoreService createStoreService,
            IPlanRepository planRepository,
            IJwtProvider jwtProvider,
            IAuthTokenConfig authTokenConfig,
            IReSellerRepository reSellerRepository,
            IReSellerOwnerRepository reSellerOwnerRepository,
            ILogger<RegisterCommandHandler> logger)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _localizer = localizer;
            _createOwnerService = createOwnerService;
            _createStoreService = createStoreService;
            _planRepository = planRepository;
            _jwtProvider = jwtProvider;
            _authTokenConfig = authTokenConfig;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
            _logger = logger;
        }

        public async Task<ResponseResult<AuthDto>> Handle(RegisterCommand request, CancellationToken cancellationToken)
        {
            // Create Owner
            Owner owner = await _createOwnerService.CreateOwnerAsync(request.Login, request.Password, request.FullName,
                request.CellPhone, request.Email, "Nombre de la tienda: " + request.StoreName);

            // Create Store
            // Self-registered stores start on the default birth plan (Pago, hardcoded in
            // CreateStoreService): grant exactly that plan's modules, NOT every catalog module
            // AvailableToStore. Keeps plan/module coherence (store pays for what it gets) and
            // keeps Superior/VIP-only modules (Warehouses 13, MultiStores 14, MultiMonedas 15,
            // Elaboración 17, MultiPayments 16) out of a Pago store.
            StorePlan? defaultPlan;
            try
            {
                defaultPlan = await _planRepository.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Pago);
            }
            catch (Exception ex)
            {
                return ResponseResult.Failure<AuthDto>(
                    new Error("Register.PlanLoadFailed", "Failed to load the default plan: " + ex.Message),
                    (int)HttpStatusCode.InternalServerError);
            }

            if (defaultPlan is null)
            {
                return ResponseResult.Failure<AuthDto>(
                    new Error("Register.PlanLoadFailed", "The default plan (Pago) is not active or does not exist."),
                    (int)HttpStatusCode.InternalServerError);
            }

            List<int> planModuleIds = defaultPlan.StorePlanModules.Select(spm => spm.ModuleId).ToList();
            // Self-registered stores are approved immediately so they are usable without an admin
            // act (product decision 2026-09-10): all creation paths force approved=true.
            var store = await _createStoreService.CreateStoreAsync(owner.Id, owner.TenantId, request.StoreName, null,
                "Tienda de prueba", true, planModuleIds);

            // FIX: Add null check to prevent NullReferenceException
            if (owner.User == null)
                return ResponseResult.Failure<AuthDto>(
                    new Error("Register.OwnerUserNotCreated", "Registration failed: user was not created properly."), 
                    (int)HttpStatusCode.InternalServerError);

            owner.User.SelectedStoreId = store.Id;

            if (!string.IsNullOrEmpty(request.Code))
            {
                ReSeller? reSeller = null;
                try
                {
                    reSeller = await _reSellerRepository.GetByUserNameAsync(request.Code);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "ReSeller lookup failed for code {Code}, continuing registration without ReSeller association", request.Code);
                    reSeller = null;
                }

                if (reSeller != null)
                {
                    try
                    {
                        ReSellerOwner reSellerOwner = ReSellerOwner.Create(reSeller.Id, owner.Id, reSeller.DiscountPrice, reSeller.PercentDiscountPrice, owner.TenantId);
                        await _reSellerOwnerRepository.AddAsync(reSellerOwner);
                    }
                    catch (Exception)
                    {
                        return ResponseResult.Failure<AuthDto>(
                            new Error("Register.ReSellerAssociationFailed", "Failed to associate with reseller."),
                            (int)HttpStatusCode.InternalServerError);
                    }
                }
            }

            int changesSaved = await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            if (changesSaved <= 0)
                return ResponseResult.Failure<AuthDto>(
                    new Error("Register.FailedToSave", "Registration failed: changes could not be saved to database."), 
                    (int)HttpStatusCode.InternalServerError);

            string token = _jwtProvider.GenerateToken(owner.User.Id, request.Login);
            var expiresAt = DateTime.UtcNow.AddDays(_authTokenConfig.TokenLifetimeDays);

            return ResponseResult.Success(new AuthDto(request.Login, token, expiresAt));
        }
    }
}
