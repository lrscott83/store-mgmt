using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Owners.Commands.UpdateOwner
{
    public sealed class UpdateOwnerCommand : ICommand<bool>
    {
        public Guid Id { get; set; }
        public Guid? ReSellerId { get; set; }
        public string FullName { get; set; }
        public string CellPhone { get; set; }
        public string? Email { get; set; }
        public string Description { get; set; }
        public bool Guest { get; set; }
        public bool IsActive { get; set; }

    }

    public class UpdateOwnerCommandHandler : ICommandHandler<UpdateOwnerCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateOwnerCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IOwnerRepository ownerRepository,
            IReSellerRepository reSellerRepository,
            IReSellerOwnerRepository reSellerOwnerRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateOwnerCommand request, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller))
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.BadRequest);

            Owner owner = await _ownerRepository.GetOwnerIncludingUserByIdAsync(request.Id);

            owner.User.FullName = request.FullName;
            owner.User.CellPhone = request.CellPhone;
            owner.User.Email = request.Email;
            owner.IsActive = request.IsActive;
            owner.Description = request.Description;
            owner.Guest = request.Guest;
            await UpdateReSellerOwnerAsync(request.ReSellerId, owner.Id, owner.TenantId);
            await _ownerRepository.UpdateAsync(owner);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }

        private async Task UpdateReSellerOwnerAsync(Guid? reSellerId, Guid ownerId, Guid tenantId)
        {
            ReSellerOwner reSellerOwner = await _reSellerOwnerRepository.GetByOwnerIdAsync(ownerId);
            if (reSellerId.HasValue)
            {
                ReSeller reSeller = await _reSellerRepository.GetByIdAsync(reSellerId.Value);
                if (reSellerOwner != null)
                {
                    if (reSellerId.HasValue)
                    {
                        // Update
                        reSellerOwner.IsActive = true;
                        reSellerOwner.ReSellerId = reSellerId.Value;
                        reSellerOwner.PercentDiscountPrice = reSeller.PercentDiscountPrice;
                        reSellerOwner.DiscountPrice = reSeller.DiscountPrice;
                        await _reSellerOwnerRepository.UpdateAsync(reSellerOwner);
                    }
                }
                else
                {
                    // Insert
                    reSellerOwner = ReSellerOwner.Create(reSellerId.Value, ownerId, reSeller.DiscountPrice, reSeller.PercentDiscountPrice, tenantId);
                    await _reSellerOwnerRepository.AddAsync(reSellerOwner);
                }
            } 
            else if (reSellerOwner != null)
            {
                await _reSellerOwnerRepository.DeleteAsync(reSellerOwner);
            }
        }
    }
}
