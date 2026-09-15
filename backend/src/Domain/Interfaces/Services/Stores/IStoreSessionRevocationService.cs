using Domain.Entities.Stores;

namespace Domain.Interfaces.Services.Stores
{
    /// <summary>
    /// Store deactivation blast-radius revocation (store-deactivation-session-revocation):
    /// revokes every active refresh token of the users affected by deactivating a
    /// store — users whose SelectedStoreId points at the store UNION users employed
    /// at the store. Stages only; the deactivation handler's UnitOfWork SaveChanges
    /// persists the flag flip and the token revocations atomically.
    /// </summary>
    public interface IStoreSessionRevocationService
    {
        Task RevokeStoreSessionsAsync(Guid storeId, CancellationToken cancellationToken = default);
    }
}
