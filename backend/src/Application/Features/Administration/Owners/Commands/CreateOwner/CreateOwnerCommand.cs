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
using Domain.Interfaces.Services.Owners;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;
using System.Text.Json.Serialization;

namespace Application.Features.Administration.Owners.Commands.CreateOwner
{
    // ReSellerId carries a property-level converter so an empty/whitespace JSON string binds to
    // null ("no Gestor") instead of failing the WHOLE body. Kept at property level on purpose:
    // a global JsonSerializerOptions change would loosen every Guid? in the API.
    public sealed record CreateOwnerCommand(string Login, string Password, string FullName, string Cellphone,
        [property: JsonConverter(typeof(NullableGuidJsonConverter))] Guid? ReSellerId, string? Email, string? Description) : ICommand<OwnerDto> { }

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

            // A Gestor that creates an owner IS that owner's Gestor, so the link is derived from
            // the authenticated actor and any body reSellerId is IGNORED (not rejected) — otherwise
            // a Gestor could push the new owner onto someone else's list, and could also leave it
            // unlinked (the React form renders the selector for SuperAdmin only, so a Gestor never
            // sends one). The link is not cosmetic: OwnerRepository's ReSeller-scoped list filters
            // on ReSellerOwner.ReSeller.UserId, so an unlinked owner is invisible in the Gestor's
            // own list. A SuperAdmin has no ReSeller entity, so for that role the body selector
            // stays the only way to assign a Gestor — unchanged.
            if (_httpContextService.IsReSeller && !_httpContextService.IsSuperAdmin)
            {
                await CreateReSellerOwnerForActor(owner);
            }
            else if (request.ReSellerId.HasValue)
            {
                await CreateReSellerOwner(request.ReSellerId.Value, owner.Id, owner.TenantId);
            }

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

        // Mirrors RegisterCommand's ReSellerOwner.Create(...) — same discount snapshot, same tenant.
        private async Task CreateReSellerOwnerForActor(Owner owner)
        {
            ReSeller? reSeller = await _reSellerRepository.GetByUserIdIgnoreQueryFiltersAsync(
                _httpContextService.UserExternalId.ToGuid());

            // The ReSeller role can exist without a ReSeller row (E2E seeds do exactly that). There
            // is no Gestor to link then, and throwing would turn a state that has always answered
            // 201 into a 400 — so the owner is created unlinked, as it is today.
            if (reSeller is null)
                return;

            ReSellerOwner reSellerOwner = ReSellerOwner.Create(reSeller.Id, owner.Id, reSeller.DiscountPrice,
                reSeller.PercentDiscountPrice, owner.TenantId);
            await _reSellerOwnerRepository.AddAsync(reSellerOwner);
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
