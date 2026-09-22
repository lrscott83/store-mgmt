using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.SwitchMyStore
{
    /// <summary>
    /// seamless-store-switch v2 — the in-session store switch. Persists the
    /// selection (exactly like SetMyStoreCommand) AND returns the TARGET
    /// store's DEK wrapped under the CURRENT store's DEK.
    ///
    /// Why the wrap matters: the client holds the current store's DEK in
    /// memory but no password, and a device that has never re-logged-in since
    /// the target store appeared holds no per-store device wrap for it either
    /// — the old flow's only option there was logging the user out. The
    /// server, which derives every store's DEK from the master secret
    /// (StoreDataKeyProvider.GetDek = HKDF(masterSecret, storeId)), can hand
    /// the client the one key it cannot reconstruct: the target DEK under a
    /// key the client already holds. The switch is then seamless on ANY
    /// device, regardless of when the target store was created or granted.
    /// </summary>
    public sealed record SwitchMyStoreCommand(Guid StoreId) : ICommand<SwitchMyStoreResult> { }

    /// <summary>
    /// <see cref="Changed"/> is false when the selection does not move
    /// (re-selecting the current store is a no-op). The wrap fields are EMPTY
    /// whenever the client cannot benefit from them — no selection change, no
    /// previous store to wrap under, or a wrap failure — which the client
    /// treats as "fall back to the device wrap table / legacy logout".
    /// The switch itself NEVER fails because of the wrap.
    /// </summary>
    public sealed record SwitchMyStoreResult(
        bool Changed,
        string WrappedDek,
        string WrapSalt,
        string WrapIv);

    public sealed class SwitchMyStoreCommandHandler : ICommandHandler<SwitchMyStoreCommand, SwitchMyStoreResult>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreDataKeyProvider _storeDataKeyProvider;
        private readonly IStoreKeyWrapService _storeKeyWrapService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<SwitchMyStoreCommandHandler> _logger;

        public SwitchMyStoreCommandHandler(
            IHttpContextService httpContextService,
            IUserRepository userRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IStoreRepository storeRepository,
            IStoreDataKeyProvider storeDataKeyProvider,
            IStoreKeyWrapService storeKeyWrapService,
            IStringLocalizer<I18n> localizer,
            ILogger<SwitchMyStoreCommandHandler> logger)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _storeRepository = storeRepository;
            _storeDataKeyProvider = storeDataKeyProvider;
            _storeKeyWrapService = storeKeyWrapService;
            _localizer = localizer;
            _logger = logger;
        }

        public async Task<ResponseResult<SwitchMyStoreResult>> Handle(SwitchMyStoreCommand request, CancellationToken cancellationToken)
        {
            var user = await _userRepository.GetByIdAsync(_httpContextService.UserExternalId.ToGuid());
            if (user is null)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            // Same authorization contract as SetMyStoreCommandHandler: the
            // target store must be one of the caller's active stores.
            if (!_httpContextService.IsSuperAdmin)
            {
                var accessibleStores = await _storeRepository.GetActiveStoresByUserIdAsync(user.Id);
                if (!accessibleStores.Any(s => s.Id == request.StoreId))
                    throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);
            }

            var previousStoreId = user.SelectedStoreId;
            var changed = previousStoreId != request.StoreId;

            if (changed)
            {
                user.SelectedStoreId = request.StoreId;
                await _userRepository.UpdateAsync(user);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            }

            var (wrappedDek, wrapSalt, wrapIv) = TryBuildTargetDekWrap(previousStoreId, request.StoreId, changed);
            return ResponseResult.Success(new SwitchMyStoreResult(changed, wrappedDek, wrapSalt, wrapIv));
        }

        /// <summary>
        /// Wraps the TARGET store's DEK under the CURRENT (pre-switch) store's
        /// DEK. The KEK input is the UTF-8 bytes of the current DEK's base64
        /// TEXT — the client re-derives the identical KEK from its in-memory
        /// DEK bytes with the exact same PBKDF2 input
        /// (dek-unwrap.ts <c>unwrapDekWithDek</c>). Any degradation yields
        /// empty fields and a successful response (same never-fail discipline
        /// as the login wrap builder): the client then falls back to its
        /// per-store device wrap table, and only logs out when THAT is absent
        /// too.
        /// </summary>
        private (string WrappedDek, string WrapSalt, string WrapIv) TryBuildTargetDekWrap(
            Guid previousStoreId, Guid targetStoreId, bool changed)
        {
            if (!changed || previousStoreId == Guid.Empty)
                return ("", "", "");

            try
            {
                byte[] currentDek = _storeDataKeyProvider.GetDek(previousStoreId);
                byte[] targetDek = _storeDataKeyProvider.GetDek(targetStoreId);
                WrappedDekResult wrapped = _storeKeyWrapService.WrapDek(Convert.ToBase64String(currentDek), targetDek);
                return (wrapped.WrappedDek, wrapped.WrapSalt, wrapped.WrapIv);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to build the switch DEK wrap for target store {TargetStoreId} (from {PreviousStoreId}); the client falls back to its device wrap table",
                    targetStoreId, previousStoreId);
                return ("", "", "");
            }
        }
    }
}
