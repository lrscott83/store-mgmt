using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Owners;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Owners.Commands.UpdateOwner
{
    public sealed class UpdateOwnerCommand : ICommand<OwnerDto>
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

    public class UpdateOwnerCommandHandler : ICommandHandler<UpdateOwnerCommand, OwnerDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IMapper _mapper;

        public UpdateOwnerCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IOwnerRepository ownerRepository,
            IReSellerRepository reSellerRepository,
            IReSellerOwnerRepository reSellerOwnerRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IMapper mapper)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
            _localizer = localizer;
            _mapper = mapper;
        }

        public async Task<ResponseResult<OwnerDto>> Handle(UpdateOwnerCommand request, CancellationToken cancellationToken)
        {
            Owner? owner = await _ownerRepository.GetOwnerWithUserTrackedAsync(request.Id, cancellationToken);
            if (owner is null)
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.NotFound)
                {
                    AcctionCode = "OwnerNotFound"
                };

            if (!_httpContextService.IsSuperAdmin && owner.TenantId != _httpContextService.TenantId.ToGuid())
                throw new ApiException(_localizer["OwnerNotFound"], HttpStatusCode.NotFound)
                {
                    AcctionCode = "OwnerNotFound"
                };

            owner.User.FullName = request.FullName;
            owner.User.CellPhone = request.CellPhone;
            owner.User.Email = request.Email;
            owner.IsActive = request.IsActive;
            owner.Description = request.Description;
            owner.Guest = request.Guest;
            await UpdateReSellerOwnerAsync(request.ReSellerId, owner.Id, owner.TenantId);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            return ResponseResult.Success(_mapper.Map<OwnerDto>(owner));
        }

        private async Task UpdateReSellerOwnerAsync(Guid? reSellerId, Guid ownerId, Guid tenantId)
        {
            ReSellerOwner reSellerOwner = await _reSellerOwnerRepository.GetByOwnerIdAsync(ownerId);
            if (reSellerId.HasValue)
            {
                ReSeller reSeller = await _reSellerRepository.GetByIdAsync(reSellerId.Value);
                if (reSeller is null)
                    throw new ApiException(_localizer["ReSellerNotFound"], HttpStatusCode.BadRequest)
                    {
                        AcctionCode = "ReSellerId"
                    };
                if (reSellerOwner != null)
                {
                    // Update
                    reSellerOwner.IsActive = true;
                    reSellerOwner.ReSellerId = reSellerId.Value;
                    reSellerOwner.PercentDiscountPrice = reSeller.PercentDiscountPrice;
                    reSellerOwner.DiscountPrice = reSeller.DiscountPrice;
                    await _reSellerOwnerRepository.UpdateAsync(reSellerOwner);
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
