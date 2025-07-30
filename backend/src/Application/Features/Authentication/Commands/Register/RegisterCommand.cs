using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.Features.Authentication.Commands.Login;
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
using MediatR;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Authentication.Commands.Register
{
    public sealed record RegisterCommand(string Login, string Password, string FullName, string CellPhone, string? Email,
        string StoreName, string Code)
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
        private readonly ISender _sender;
        private readonly IStringLocalizer<I18n> _localizer;

        public RegisterCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IUserRepository userRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            ICreateOwnerService createOwnerService,
            ICreateStoreService createStoreService,
            IModuleRepository moduleRepository,
            ISender sender,
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
            _sender = sender;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
        }

        public async Task<ResponseResult<bool>> Handle(RegisterCommand request, CancellationToken cancellationToken)
        {
            // Create Owner
            Owner owner = await _createOwnerService.CreateOwnerAsync(request.Login, request.Password, request.FullName,
                request.CellPhone, request.Email, "Nombre de la tienda: " + request.StoreName);

            // Create Store
            IEnumerable<Module> availableModules = await _moduleRepository.GetAvailableModulesToStore();
            HashSet<int> availableModuleIds = availableModules.Select(f => f.Id).ToHashSet();
            var store = await _createStoreService.CreateStoreAsync(owner.Id, owner.TenantId, request.StoreName, null,
                "Tienda de prueba", false, availableModuleIds.ToList());

            owner.User.SelectedStoreId = store.Id;
            //await _userRepository.UpdateAsync(owner.User);

            if (!string.IsNullOrEmpty(request.Code))
            {
                ReSeller reSeller = await _reSellerRepository.GetByUserNameAsync(request.Code);
                if (reSeller != null)
                {
                    ReSellerOwner reSellerOwner = ReSellerOwner.Create(reSeller.Id, owner.Id, reSeller.DiscountPrice, reSeller.PercentDiscountPrice, owner.TenantId);
                    await _reSellerOwnerRepository.AddAsync(reSellerOwner);
                }
            }

            bool success = await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0;

            if (!success)
                return ResponseResult.Failure<bool>(
                    new Error("Register.Unknown", $"The User was not created."), (int)HttpStatusCode.BadRequest);

            ResponseResult<AuthDto> responseResult = await _sender.Send(new LoginCommand(request.Login, request.Password), cancellationToken);
            return responseResult.Succeeded
                ? ResponseResult.Success(true)
                : ResponseResult.Failure<bool>(responseResult.Errors, (int)HttpStatusCode.BadRequest);
        }
    }
}
