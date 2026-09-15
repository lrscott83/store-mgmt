using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;

namespace Application.Services.Stores
{
    /// <summary>
    /// Store deactivation blast-radius revocation (store-deactivation-session-revocation).
    /// Affected set = users whose SelectedStoreId points at the deactivated store
    /// (their /me verdict would 404 anyway — this kills the refresh token too, so
    /// the session cannot resurrect through rotation) UNION users employed at the
    /// store (their login is blocked while the store is inactive; a session whose
    /// SelectedStoreId was moved elsewhere but whose employment died must not
    /// outlive the deactivation either).
    ///
    /// Stages Revoke() + repository Update() per token — the RevokeCommand pattern
    /// generalized to a set. Does NOT SaveChanges: the deactivation handler's
    /// UnitOfWork persists the store flag flip and all token revocations in one
    /// transaction, so a failed deactivation leaves sessions untouched.
    /// </summary>
    public class StoreSessionRevocationService : IStoreSessionRevocationService
    {
        private readonly IUserRepository _userRepository;
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IRefreshTokenRepository _refreshTokenRepository;

        public StoreSessionRevocationService(
            IUserRepository userRepository,
            IStoreUserRepository storeUserRepository,
            IRefreshTokenRepository refreshTokenRepository)
        {
            _userRepository = userRepository;
            _storeUserRepository = storeUserRepository;
            _refreshTokenRepository = refreshTokenRepository;
        }

        public async Task RevokeStoreSessionsAsync(Guid storeId, CancellationToken cancellationToken = default)
        {
            // Blast radius, filter-free: a SuperAdmin-driven deactivation crosses
            // tenants, and the store is already inactive at this point — the
            // tenant/IsActive-filtered user queries would return nothing.
            var selectedUserIds = await _userRepository
                .GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId, cancellationToken);

            // includeInactive: true — the employment row's own IsActive is not the
            // deactivation signal; the store's is. The repository predicate is
            // StoreId-only + IgnoreQueryFilters, usable post-flip.
            var employedUserIds = (await _storeUserRepository.GetStoreUsersByStoreIdAsync(storeId, includeInactive: true))
                .Select(su => su.UserId);

            var affectedUserIds = selectedUserIds
                .Concat(employedUserIds)
                .Distinct()
                .ToList();

            if (affectedUserIds.Count == 0)
                return;

            var activeTokens = await _refreshTokenRepository
                .GetActiveByUserIdsAsync(affectedUserIds, cancellationToken);

            foreach (var token in activeTokens)
            {
                token.Revoke();
                _refreshTokenRepository.Update(token);
            }
        }
    }
}
