using Domain.Entities.Messages;

namespace Domain.Interfaces.Repositories;

public interface IMessageRepository
{
    Task<IEnumerable<Conversation>> GetConversationsAsync(Guid currentUserId, bool isSuperAdmin, CancellationToken cancellationToken);
    Task<Conversation?> GetConversationAsync(Guid conversationId, CancellationToken cancellationToken);
    Task<int> GetUnreadCountAsync(Guid conversationId, Guid currentUserId, CancellationToken cancellationToken);
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
}
