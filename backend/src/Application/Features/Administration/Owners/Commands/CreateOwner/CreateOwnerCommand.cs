using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Owners;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Owners.Commands.CreateOwner
{
    public sealed record CreateOwnerCommand(string Login, string Password, string FullName, string Cellphone,
        Guid? ReSellerId, string? Email, string? Description) : ICommand<OwnerDto> { }

    public class CreateOwnerCommandHandler : ICommandHandler<CreateOwnerCommand, OwnerDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly ICreateOwnerService _createOwnerService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IMapper _mapper;

        public CreateOwnerCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IReSellerRepository reSellerRepository,
            IReSellerOwnerRepository reSellerOwnerRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            ICreateOwnerService createOwnerService,
            IMapper mapper)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
            _localizer = localizer;
            _createOwnerService = createOwnerService;
            _mapper = mapper;
        }

        public async Task<ResponseResult<OwnerDto>> Handle(CreateOwnerCommand request, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller))
                throw new ApiException(_localizer["Unauthorized"], HttpStatusCode.Forbidden);

            Owner owner = await _createOwnerService.CreateOwnerAsync(request.Login, request.Password, request.FullName,
                request.Cellphone, request.Email, request.Description);

            if (request.ReSellerId.HasValue)
                await CreateReSellerOwner(request.ReSellerId.Value, owner.Id, owner.TenantId);

            try
            {
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException e) when (IsUniqueViolation(e))
            {
                // Unique index on User.Login (and Tenant.Name, set to the login) — duplicate login.
                throw new ApiException(_localizer["DuplicateLogin"], HttpStatusCode.Conflict)
                {
                    AcctionCode = "Owner.DuplicateLogin"
                };
            }

            return ResponseResult.Success(_mapper.Map<OwnerDto>(owner));
        }

        private async Task CreateReSellerOwner(Guid reSellerId, Guid ownerId, Guid tenantId)
        {
            ReSeller reSeller = await _reSellerRepository.GetByIdAsync(reSellerId);
            if (reSeller is null)
                throw new ApiException(_localizer["ReSellerNotFound"], HttpStatusCode.BadRequest);
            ReSellerOwner reSellerOwner = ReSellerOwner.Create(reSellerId, ownerId, reSeller.DiscountPrice, reSeller.PercentDiscountPrice, tenantId);
            await _reSellerOwnerRepository.AddAsync(reSellerOwner);
        }

        private static bool IsUniqueViolation(DbUpdateException e)
        {
            var message = e.InnerException?.Message ?? e.Message;
            return message.Contains("unique", StringComparison.OrdinalIgnoreCase)
                || message.Contains("duplicate", StringComparison.OrdinalIgnoreCase);
        }
    }
}
