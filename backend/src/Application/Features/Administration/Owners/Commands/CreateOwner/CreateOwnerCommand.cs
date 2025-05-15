using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Owners.Commands.CreateOwner
{
    public sealed record CreateOwnerCommand(string Login, string Password, string FullName, string Cellphone,
        Guid? ReSellerId, string? Email, string? Description) : ICommand<bool> { }

    public class CreateOwnerCommandHandler : ICommandHandler<CreateOwnerCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly ICreateOwnerService _createOwnerService;
        private readonly IStringLocalizer<I18n> _localizer;

        public CreateOwnerCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IReSellerRepository reSellerRepository,
            IReSellerOwnerRepository reSellerOwnerRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            ICreateOwnerService createOwnerService)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
            _localizer = localizer;
            _createOwnerService = createOwnerService;
        }

        public async Task<ResponseResult<bool>> Handle(CreateOwnerCommand request, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller))
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            Owner owner = await _createOwnerService.CreateOwnerAsync(request.Login, request.Password, request.FullName,
                request.Cellphone, request.Email, request.Description);

            if (request.ReSellerId.HasValue)
                await CreateReSellerOwner(request.ReSellerId.Value, owner.Id, owner.TenantId);

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }

        private async Task CreateReSellerOwner(Guid reSellerId, Guid ownerId, Guid tenantId)
        {
            ReSeller reSeller = await _reSellerRepository.GetByIdAsync(reSellerId);
            ReSellerOwner reSellerOwner = ReSellerOwner.Create(reSellerId, ownerId, reSeller.DiscountPrice, reSeller.PercentDiscountPrice, tenantId);
            await _reSellerOwnerRepository.AddAsync(reSellerOwner);
        }
    }
}
