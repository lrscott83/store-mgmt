using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.SetStoreActivation
{
    /// <summary>
    /// Sets a store's IsActive flag (both directions — activate AND deactivate).
    /// The owner's lever over their stores: unlike the general store update (where
    /// IsActive is SuperAdmin-only), an OwnerAdmin may flip the flag through this
    /// dedicated endpoint. SuperAdmin sees and touches everything, same as every
    /// other store command (UpdateStore/DeactivateStore/ActivateStore pattern).
    /// </summary>
    public sealed record SetStoreActivationCommand(Guid Id, bool IsActive) : ICommand<bool> { }

    public class SetStoreActivationCommandHandler : ICommandHandler<SetStoreActivationCommand, bool>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IStoreSessionRevocationService _storeSessionRevocationService;

        public SetStoreActivationCommandHandler(
            IStoreRepository storeRepository,
            IGetStoreByIdService storeByIdService,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IStoreSessionRevocationService storeSessionRevocationService)
        {
            _storeRepository = storeRepository;
            _storeByIdService = storeByIdService;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
            _storeSessionRevocationService = storeSessionRevocationService;
        }

        public async Task<ResponseResult<bool>> Handle(SetStoreActivationCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden);

            // Same load as DeactivateStore/ActivateStore: GetStoreByIdIncludingModulesAsync
            // via IGetStoreByIdService. It honors the tenant query filter; the SuperAdmin
            // (who sees everything) passes it, and an OwnerAdmin can only reach stores in
            // their own tenant — the same reach they already have through UpdateStore.
            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

            // The DefaultStore is system infrastructure (every listing excludes it —
            // GetStoresByCurrentUserQuery excludes it on all three role branches); it
            // must never be flipped through this endpoint.
            if (store.Id == Domain.Common.Constants.DataUtils.DefaultStore.Id)
                throw new ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden);

            // Capture the transition BEFORE the flip: revocation fires only on
            // true→false (store-deactivation-session-revocation). Same-value PUTs
            // (A-13 idempotency) and reactivations must not re-run the pass —
            // revoked tokens stay revoked; reactivation restores login, not
            // sessions.
            var wasActive = store.IsActive;

            store.IsActive = request.IsActive;

            if (wasActive && !store.IsActive)
                await _storeSessionRevocationService.RevokeStoreSessionsAsync(store.Id, cancellationToken);

            await _storeRepository.UpdateAsync(store);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
