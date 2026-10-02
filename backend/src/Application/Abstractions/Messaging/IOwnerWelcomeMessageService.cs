namespace Application.Abstractions.Messaging;

/// <summary>
/// Posts the platform's welcome greeting into a brand new owner's chat conversation.
/// </summary>
/// <remarks>
/// <para><b>Call it only AFTER the registration has been committed.</b> Every write on
/// <see cref="Domain.Interfaces.Repositories.IMessageRepository"/> commits internally
/// (<c>SaveChangesAsync</c> per method), while <see cref="Domain.Interfaces.Services.Authentication.IRegisterService"/>
/// stages entities and never commits — the handler owns the single save. Invoking this before the
/// handler's save would flush the repository's own call first, leave nothing staged for the handler,
/// and make the handler's save return 0 — failing EVERY registration with
/// <c>Register.FailedToSave</c> (HTTP 500).</para>
/// <para><b>It never throws.</b> A greeting is not worth a failed registration: any failure is
/// swallowed and logged, and the registration response is unaffected.</para>
/// </remarks>
public interface IOwnerWelcomeMessageService
{
    /// <summary>
    /// Sends the greeting to <paramref name="ownerUserId"/> in the conversation scoped to
    /// (<paramref name="ownerUserId"/>, <paramref name="storeId"/>), creating that conversation when
    /// it does not exist yet. Idempotent per conversation: an existing conversation is reused.
    /// </summary>
    /// <param name="ownerUserId">The owner's USER id (<c>Owner.UserId</c>) — never the <c>Owner</c>
    /// entity id. <c>Conversation.OwnerId</c> and <c>Message.RecipientId</c> are both user ids;
    /// <c>MessageRepository.GetStoreIdsByOwnerAsync</c> and <c>GetConversationsAsync</c> read them as
    /// such.</param>
    /// <param name="ownerFullName">The owner's <c>User.FullName</c>, interpolated into the greeting.</param>
    /// <param name="storeId">The owner's selected store. The conversation is unique on
    /// (OwnerId, StoreId), so a store-less greeting has nowhere to live.</param>
    Task SendAsync(Guid ownerUserId, string ownerFullName, Guid storeId, CancellationToken cancellationToken);
}
