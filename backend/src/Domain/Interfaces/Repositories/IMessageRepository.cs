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
    Task<Guid> GetSuperAdminIdAsync(CancellationToken cancellationToken);
    Task<Conversation?> GetConversationByOwnerAndStoreAsync(Guid ownerId, Guid storeId, CancellationToken cancellationToken);
}
