using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Results;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Authentication.Commands.Register
{
    public sealed record RegisterCommand(string Login, string Password, string FullName, string CellPhone, string? Email,
        string StoreName, string? Code)
        : ICommand<bool>
    { }

    public class RegisterCommandHandler : ICommandHandler<RegisterCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IUserRepository _userRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly ICreateOwnerService _createOwnerService;
        private readonly ICreateStoreService _createStoreService;
        private readonly IModuleRepository _moduleRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly IJwtProvider _jwtProvider;
        private readonly IStringLocalizer<I18n> _localizer;

        public RegisterCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IUserRepository userRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            ICreateOwnerService createOwnerService,
            ICreateStoreService createStoreService,
            IModuleRepository moduleRepository,
            IJwtProvider jwtProvider,
            IReSellerRepository reSellerRepository,
            IReSellerOwnerRepository reSellerOwnerRepository)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _localizer = localizer;
            _createOwnerService = createOwnerService;
            _createStoreService = createStoreService;
            _moduleRepository = moduleRepository;
            _jwtProvider = jwtProvider;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
        }

        public async Task<ResponseResult<bool>> Handle(RegisterCommand request, CancellationToken cancellationToken)
        {
            // Create Owner
            Owner owner = await _createOwnerService.CreateOwnerAsync(request.Login, request.Password, request.FullName,
                request.CellPhone, request.Email, "Nombre de la tienda: " + request.StoreName);

            // Create Store
            IEnumerable<Module> availableModules;
            try
            {
                availableModules = await _moduleRepository.GetAvailableModulesToStore();
            }
            catch (Exception ex)
            {
                return ResponseResult.Failure<bool>(
                    new Error("Register.ModuleLoadFailed", "Failed to load available modules: " + ex.Message),
                    (int)HttpStatusCode.InternalServerError);
            }
            HashSet<int> availableModuleIds = availableModules.Select(f => f.Id).ToHashSet();
            var store = await _createStoreService.CreateStoreAsync(owner.Id, owner.TenantId, request.StoreName, null,
                "Tienda de prueba", false, availableModuleIds.ToList());

            // FIX: Add null check to prevent NullReferenceException
            if (owner.User == null)
                return ResponseResult.Failure<bool>(
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
                catch (Exception)
                {
                    // ReSeller lookup failure is optional - registration continues
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
                        return ResponseResult.Failure<bool>(
                            new Error("Register.ReSellerAssociationFailed", "Failed to associate with reseller."),
                            (int)HttpStatusCode.InternalServerError);
                    }
                }
            }

            int changesSaved = await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            if (changesSaved <= 0)
                return ResponseResult.Failure<bool>(
                    new Error("Register.FailedToSave", "Registration failed: changes could not be saved to database."), 
                    (int)HttpStatusCode.InternalServerError);

            // FIX: Generate token directly instead of calling ISender.Send with LoginCommand
            // This is a performance optimization - no need to re-authenticate after registration
            string token = _jwtProvider.GenerateToken(owner.User.Id, request.Login);
            
            // Note: The AuthDto with token is generated but not returned.
            // The command returns bool to indicate success/failure.
            // If you need to return the token, consider changing the command to return AuthDto instead.
            return ResponseResult.Success(true);
        }
    }
}
