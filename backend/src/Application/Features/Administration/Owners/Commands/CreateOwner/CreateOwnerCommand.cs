using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Owners;
using Application.Exceptions;
using Application.ResponseModels;
using Application.Services.Messages;
using Application.Services.Notifications;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Authentication;
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
        [property: JsonConverter(typeof(NullableGuidJsonConverter))] Guid? ReSellerId, string? Email,
        string? Description, string StoreName) : ICommand<OwnerDto> { }

    /// <summary>
    /// Now a thin adapter over <see cref="IRegisterService"/> — the SAME flow the public
    /// registration uses. Previously this handler created only the owner, so a customer added by
    /// a Gestor ended up with no store at all: no Billing, no modules, nothing to sell in. The
    /// Gestor could not even fix it by hand, because /management/stores/create is gated to
    /// SuperAdmin/OwnerAdmin.
    /// </summary>
    /// <remarks>
    /// Unlike the register handler, this one does NOT catch the service's ApiException. That is
    /// deliberate and is the opposite choice on purpose: OwnersController renders a returned
    /// failure as <c>Ok(result)</c> (HTTP 200 with succeeded:false), whereas an escaping
    /// ApiException reaches the middleware and produces its real status. Catching here would turn
    /// every failure into a 200.
    /// </remarks>
    public class CreateOwnerCommandHandler : ICommandHandler<CreateOwnerCommand, OwnerDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IRegisterService _registerService;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IMapper _mapper;
        private readonly IOwnerWelcomeMessageService _ownerWelcomeMessageService;
        private readonly IOwnerRegistrationNotificationService _ownerRegistrationNotificationService;

        public CreateOwnerCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IReSellerRepository reSellerRepository,
            IRegisterService registerService,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IMapper mapper,
            IOwnerWelcomeMessageService ownerWelcomeMessageService,
            IOwnerRegistrationNotificationService ownerRegistrationNotificationService)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _reSellerRepository = reSellerRepository;
            _registerService = registerService;
            _localizer = localizer;
            _mapper = mapper;
            _ownerWelcomeMessageService = ownerWelcomeMessageService;
            _ownerRegistrationNotificationService = ownerRegistrationNotificationService;
        }

        public async Task<ResponseResult<OwnerDto>> Handle(CreateOwnerCommand request, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller))
                throw new ApiException(_localizer["Unauthorized"], HttpStatusCode.Forbidden);

            // The service takes a Gestor LOGIN; which Gestor that is depends on the role, so it is
            // resolved here — never read straight off the body for the Gestor flow.
            string? reSellerLogin = await ResolveReSellerLoginAsync(request);

            Owner owner = await _registerService.RegisterAsync(
                request.Login,
                request.Password,
                request.FullName,
                request.Cellphone,
                request.Email,
                request.StoreName,
                // Unlike the public registration (which synthesizes "Nombre de la tienda: {name}"),
                // this flow forwards the description the form actually collected.
                request.Description,
                reSellerLogin,
                cancellationToken);

            // The single save for this handler — the service staged everything but committed
            // nothing, so owner + store + modules + Gestor link land atomically or not at all.
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

            // Only now, AFTER the single commit above. MessageRepository commits internally, so
            // greeting before this save would flush its own call first, leave nothing staged here,
            // and make this SaveChangesAsync a no-op — owner + store would never land. The service
            // never throws, so the OwnerDto below is unaffected by a greeting failure.
            await SendWelcomeMessageAsync(owner, cancellationToken);

            // Same ordering rule as the greeting above, for the same reason:
            // NotificationRepository commits internally, so notifying before this handler's save
            // would flush first and owner + store would never land. The service never throws, so the
            // OwnerDto below is unaffected. Without this second call site every Gestor-created
            // owner would register silently — that is the whole reason the notification is emitted
            // from BOTH registration entry points.
            await NotifyOwnerRegistrationAsync(owner, request.Cellphone, request.StoreName, cancellationToken);

            return ResponseResult.Success(_mapper.Map<OwnerDto>(owner));
        }

        /// <summary>
        /// Posts the welcome greeting to the customer the Gestor just created, or skips it. Nothing
        /// here can change the response: the gate and the "anything missing" case both return
        /// without calling the service, and the service itself swallows and logs its own failures.
        /// </summary>
        private async Task SendWelcomeMessageAsync(Owner owner, CancellationToken cancellationToken)
        {
            OwnerWelcomeMessage.OwnerWelcomeTarget? target = OwnerWelcomeMessage.Resolve(owner);

            if (target is null)
                return;

            await _ownerWelcomeMessageService.SendAsync(
                target.OwnerUserId, target.OwnerFullName, target.StoreId, cancellationToken);
        }

        /// <summary>
        /// Tells the SuperAdmin an owner was just created on their behalf, or skips it. Nothing here
        /// can change the response: the gate and the "anything missing" case both return without
        /// calling the service, and the service itself swallows and logs its own failures.
        /// </summary>
        private async Task NotifyOwnerRegistrationAsync(
            Owner owner, string cellphone, string storeName, CancellationToken cancellationToken)
        {
            OwnerRegistrationNotification.OwnerRegistrationTarget? target =
                OwnerRegistrationNotification.Resolve(owner, cellphone, storeName);

            if (target is null)
                return;

            await _ownerRegistrationNotificationService.NotifyAsync(target, cancellationToken);
        }

        /// <summary>
        /// A Gestor that creates an owner IS that owner's Gestor, so its login is derived from the
        /// AUTHENTICATED ACTOR and any body reSellerId is IGNORED (not rejected) — otherwise a
        /// Gestor could push the new owner onto someone else's list. The link is not cosmetic:
        /// OwnerRepository's ReSeller-scoped list filters on ReSellerOwner.ReSeller.UserId, so an
        /// unlinked owner is invisible in the Gestor's own list. A SuperAdmin has no ReSeller
        /// entity, so for that role the body selector stays the only way to assign one.
        /// </summary>
        private async Task<string?> ResolveReSellerLoginAsync(CreateOwnerCommand request)
        {
            if (_httpContextService.IsReSeller && !_httpContextService.IsSuperAdmin)
            {
                // The ReSeller role can exist without a ReSeller row (E2E seeds do exactly that).
                // There is no Gestor to link then, and that has always been a tolerated state that
                // still answers 201 — so a null login means "register with no Gestor", not an error.
                ReSeller? actor = await _reSellerRepository.GetByUserIdIgnoreQueryFiltersAsync(
                    _httpContextService.UserExternalId.ToGuid());
                return actor?.User?.Login;
            }

            if (request.ReSellerId.HasValue)
            {
                ReSeller? picked = await _reSellerRepository.GetReSellerIncludingUserByIdAsync(request.ReSellerId.Value);
                if (picked is null)
                    throw new ApiException(_localizer["ReSellerNotFound"], HttpStatusCode.BadRequest);
                return picked.User?.Login;
            }

            return null;
        }

        private static bool IsUniqueViolation(DbUpdateException e)
        {
            var message = e.InnerException?.Message ?? e.Message;
            return message.Contains("unique", StringComparison.OrdinalIgnoreCase)
                || message.Contains("duplicate", StringComparison.OrdinalIgnoreCase);
        }
    }
}