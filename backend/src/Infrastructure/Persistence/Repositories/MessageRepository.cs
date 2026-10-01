using Domain.Entities.Messages;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories;

public class MessageRepository : IMessageRepository
{
    private readonly ApplicationDbContext _dbContext;

    public MessageRepository(ApplicationDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IEnumerable<Conversation>> GetConversationsAsync(Guid currentUserId, bool isSuperAdmin, CancellationToken cancellationToken)
    {
        return await _dbContext.Conversations
            .AsNoTracking()
            .Where(c => isSuperAdmin || c.OwnerId == currentUserId)
            .OrderByDescending(c => c.LastMessageAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<Conversation?> GetConversationAsync(Guid conversationId, CancellationToken cancellationToken)
    {
        return await _dbContext.Conversations
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == conversationId, cancellationToken);
    }

    public async Task<IEnumerable<Message>> GetMessagesAsync(Guid conversationId, Guid currentUserId, CancellationToken cancellationToken)
    {
        return await _dbContext.Messages
            .AsNoTracking()
            .Where(m => m.ConversationId == conversationId)
            .Where(m => m.SenderId == currentUserId && !m.IsDeletedBySender
                     || m.RecipientId == currentUserId && !m.IsDeletedByRecipient)
            .OrderBy(m => m.SentAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<Message?> GetMessageAsync(Guid messageId, CancellationToken cancellationToken)
    {
        return await _dbContext.Messages
            .FirstOrDefaultAsync(m => m.Id == messageId, cancellationToken);
    }

    public async Task AddMessageAsync(Message message, CancellationToken cancellationToken)
    {
        _dbContext.Messages.Add(message);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateMessageAsync(Message message, CancellationToken cancellationToken)
    {
        _dbContext.Messages.Update(message);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task AddConversationAsync(Conversation conversation, CancellationToken cancellationToken)
    {
        _dbContext.Conversations.Add(conversation);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateConversationAsync(Conversation conversation, CancellationToken cancellationToken)
    {
        _dbContext.Conversations.Update(conversation);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IEnumerable<Message>> GetUnreadMessagesAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await _dbContext.Messages
            .Where(m => m.RecipientId == userId && m.ReadAt == null)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Message>> GetMessagesForUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await _dbContext.Messages
            .Where(m => m.SenderId == userId || m.RecipientId == userId)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Guid>> GetAllOwnerIdsAsync(CancellationToken cancellationToken)
    {
        return await _dbContext.Owner
            .AsNoTracking()
            .Select(o => o.UserId)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Guid>> GetStoreIdsByOwnerAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        return await _dbContext.Store
            .AsNoTracking()
            .Where(s => s.OwnerId == ownerId)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
    }

    public async Task<Guid> GetSuperAdminIdAsync(CancellationToken cancellationToken)
    {
        var superAdmin = await _dbContext.User
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.UserRoles.Any(ur => ur.Role.Name == "SuperAdmin"), cancellationToken);

        return superAdmin?.Id ?? Guid.Empty;
    }

    public async Task<Conversation?> GetConversationByOwnerAndStoreAsync(Guid ownerId, Guid storeId, CancellationToken cancellationToken)
    {
        return await _dbContext.Conversations
            .FirstOrDefaultAsync(c => c.OwnerId == ownerId && c.StoreId == storeId, cancellationToken);
    }

    public async Task<int> GetUnreadCountAsync(Guid conversationId, Guid currentUserId, CancellationToken cancellationToken)
    {
        return await _dbContext.Messages
            .AsNoTracking()
            .CountAsync(m =>
                m.ConversationId == conversationId &&
                m.RecipientId == currentUserId &&
                m.ReadAt == null &&
                !m.IsDeletedByRecipient,
                cancellationToken);
    }
}


