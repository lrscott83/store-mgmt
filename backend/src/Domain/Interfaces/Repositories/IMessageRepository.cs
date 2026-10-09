using Domain.Entities.Messages;

namespace Domain.Interfaces.Repositories;

public interface IMessageRepository
{
    Task<IEnumerable<Conversation>> GetConversationsAsync(Guid currentUserId, bool isSuperAdmin, CancellationToken cancellationToken);
    Task<Conversation?> GetConversationAsync(Guid conversationId, CancellationToken cancellationToken);
    /// <summary>
    /// The unread count of <c>currentUserId</c> per conversation, in ONE query for the
    /// whole set. Conversations with nothing unread are simply absent from the
    /// dictionary, so callers read it as "missing means zero" instead of paying one
    /// round trip per conversation.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, int>> GetUnreadCountsAsync(IReadOnlyCollection<Guid> conversationIds, Guid currentUserId, CancellationToken cancellationToken);
    Task<IEnumerable<Message>> GetMessagesAsync(Guid conversationId, Guid currentUserId, CancellationToken cancellationToken);
    Task<Message?> GetMessageAsync(Guid messageId, CancellationToken cancellationToken);
    Task AddMessageAsync(Message message, CancellationToken cancellationToken);
    Task UpdateMessageAsync(Message message, CancellationToken cancellationToken);
    Task AddConversationAsync(Conversation conversation, CancellationToken cancellationToken);
    Task UpdateConversationAsync(Conversation conversation, CancellationToken cancellationToken);
    Task<IEnumerable<Message>> GetUnreadMessagesAsync(Guid userId, CancellationToken cancellationToken);
    Task<IEnumerable<Message>> GetMessagesForUserAsync(Guid userId, CancellationToken cancellationToken);
    Task<IEnumerable<Guid>> GetAllOwnerIdsAsync(CancellationToken cancellationToken);
    Task<IEnumerable<Guid>> GetStoreIdsByOwnerAsync(Guid ownerId, CancellationToken cancellationToken);
    /// <summary>
    /// The platform SuperAdmin an owner's messages are addressed to. Matched by role ID and
    /// across tenants — an owner lives in its own tenant, the platform admin in the default
    /// one — so it resolves correctly from an owner's request. Returns <see cref="Guid.Empty"/>
    /// only when no SuperAdmin exists at all.
    /// </summary>
    Task<Guid> GetSuperAdminIdAsync(CancellationToken cancellationToken);
    Task<Conversation?> GetConversationByOwnerAndStoreAsync(Guid ownerId, Guid storeId, CancellationToken cancellationToken);
    /// <summary>
    /// When each conversation's OWNER last wrote, in ONE query for the whole set.
    /// This is the ordering signal the SuperAdmin inbox needs: <c>Conversation</c>
    /// stores no sender, so its <c>LastMessageAt</c> moves when the admin replies too —
    /// ordering on it floats an owner to the top for the admin answering them. A
    /// conversation whose owner has never written (the SuperAdmin's welcome message
    /// is the only one in it) is ABSENT from the dictionary, which is correct:
    /// nothing the admin said makes an owner "more active".
    /// </summary>
    Task<IReadOnlyDictionary<Guid, DateTime>> GetLastOwnerMessageAtAsync(IReadOnlyCollection<Guid> conversationIds, CancellationToken cancellationToken);
}
