using Domain.Common.Constants;
using Domain.Common.Enums;
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

    /// <summary>
    /// The platform SuperAdmin that owner conversations are addressed to — the recipient
    /// stamped on every owner→platform message (<c>SendMessageCommand</c>) and its total
    /// for the unread badge.
    /// </summary>
    /// <remarks>
    /// <para><b>Matched by role ID, never by role name.</b> A <c>Role.Name</c> is the DISPLAY
    /// name — "Super Administrador" for <c>RoleType.SuperAdmin</c> (RoleEntityTypeConfiguration
    /// seeds <c>GetDisplayName()</c>) — so the previous literal <c>Role.Name == "SuperAdmin"</c>
    /// (the enum KEY) matched no row and this returned <see cref="Guid.Empty"/>. Every owner
    /// message was then stored with <c>RecipientId = Guid.Empty</c>, and the SuperAdmin's
    /// thread — which reads <c>RecipientId == currentUserId</c> — silently dropped every
    /// incoming reply: the conversation and its preview still showed, the messages did not.
    /// This is the same comparison the rest of the codebase makes for the role
    /// (<c>UserRoleRepository.IsSuperAdmin</c>: <c>Role.Id == (int)RoleType.SuperAdmin</c>).</para>
    /// <para><b>Query filters are ignored on purpose.</b> A self-registered owner lives in its
    /// OWN tenant (CreateOwnerService creates a Tenant per owner) while the platform SuperAdmin
    /// lives in the default one. Under the User query filter
    /// (<c>IsSuperAdmin || TenantId == current tenant</c>) the admin is invisible from an
    /// owner's request, so the lookup collapsed to <see cref="Guid.Empty"/> even once the role
    /// match was correct. Addressing the platform SuperAdmin is inherently cross-tenant.</para>
    /// <para><b>Deterministic.</b> An unordered <c>FirstOrDefault</c> over several SuperAdmins
    /// would route the message to an arbitrary one and leave the others blind to it — the same
    /// defect in another shape. The well-known platform identity
    /// (<c>DataUtils.SuperAdminUser.Id</c>, the sender of the welcome greeting and the addressee
    /// of the store-created notices) wins when it holds the role; otherwise the lowest id, so a
    /// given owner always reaches the same admin.</para>
    /// </remarks>
    public async Task<Guid> GetSuperAdminIdAsync(CancellationToken cancellationToken)
    {
        var superAdminIds = await _dbContext.User
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(u => u.UserRoles.Any(ur => ur.RoleId == (int)RoleType.SuperAdmin))
            .Select(u => u.Id)
            .ToListAsync(cancellationToken);

        if (superAdminIds.Count == 0)
            return Guid.Empty;

        // The platform SuperAdmin when it exists, so the owner reaches the same identity the
        // welcome message and the store-created notifications already address.
        return superAdminIds.Contains(DataUtils.SuperAdminUser.Id)
            ? DataUtils.SuperAdminUser.Id
            : superAdminIds.OrderBy(id => id).First();
    }

    public async Task<Conversation?> GetConversationByOwnerAndStoreAsync(Guid ownerId, Guid storeId, CancellationToken cancellationToken)
    {
        return await _dbContext.Conversations
            .FirstOrDefaultAsync(c => c.OwnerId == ownerId && c.StoreId == storeId, cancellationToken);
    }

    /// <summary>
    /// When the OWNER last wrote in this conversation, or <c>null</c> when they never
    /// have. This is the ordering signal the SuperAdmin inbox needs: <c>Conversation</c>
    /// stores no sender, so its <c>LastMessageAt</c> moves when the admin replies too —
    /// ordering on it floats an owner to the top for the admin answering them. The
    /// SuperAdmin's own welcome message leaves this <c>null</c>, which is correct:
    /// nothing the admin said makes an owner "more active".
    /// </summary>
    public async Task<DateTime?> GetLastOwnerMessageAtAsync(Guid conversationId, Guid ownerId, CancellationToken cancellationToken)
    {
        return await _dbContext.Messages
            .AsNoTracking()
            .Where(m => m.ConversationId == conversationId
                     && m.SenderId == ownerId
                     && !m.IsDeletedBySender)
            .OrderByDescending(m => m.SentAt)
            .Select(m => (DateTime?)m.SentAt)
            .FirstOrDefaultAsync(cancellationToken);
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


