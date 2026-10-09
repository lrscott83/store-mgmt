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
    /// When each conversation's OWNER last wrote, in ONE query for the whole set.
    /// <para>
    /// Batched on purpose: the SuperAdmin inbox calls this for every conversation it
    /// lists, and the singular form it replaces was one round trip each — an N+1 whose
    /// cost grows with the number of registered owners. The owner is resolved through
    /// the join (<c>m.SenderId == c.OwnerId</c>) instead of being passed in, because
    /// the caller is listing conversations it did not pick one of.
    /// </para>
    /// <para>
    /// A conversation whose owner has never written is ABSENT from the result, and a
    /// message the owner deleted for themselves is EXCLUDED (<c>!IsDeletedBySender</c>),
    /// exactly as the singular query did — both make the conversation fall back to "no
    /// owner activity" rather than surfacing a message its author has withdrawn.
    /// </para>
    /// </summary>
    public async Task<IReadOnlyDictionary<Guid, DateTime>> GetLastOwnerMessageAtAsync(
        IReadOnlyCollection<Guid> conversationIds,
        CancellationToken cancellationToken)
    {
        if (conversationIds.Count == 0)
            return new Dictionary<Guid, DateTime>();

        var rows = await (
            from c in _dbContext.Conversations.AsNoTracking()
            where conversationIds.Contains(c.Id)
            join m in _dbContext.Messages.AsNoTracking() on c.Id equals m.ConversationId
            where m.SenderId == c.OwnerId && !m.IsDeletedBySender
            group m by c.Id into g
            select new { ConversationId = g.Key, Last = g.Max(x => x.SentAt) }
        ).ToListAsync(cancellationToken);

        return rows.ToDictionary(r => r.ConversationId, r => r.Last);
    }

    /// <summary>
    /// The unread count of <c>currentUserId</c> per conversation, in ONE query for the
    /// whole set. Batched for the same reason as
    /// <see cref="GetLastOwnerMessageAtAsync(IReadOnlyCollection{Guid}, CancellationToken)"/>:
    /// the per-conversation call it replaces was the other half of that N+1. A
    /// conversation with nothing unread is ABSENT from the result — missing means zero.
    /// </summary>
    public async Task<IReadOnlyDictionary<Guid, int>> GetUnreadCountsAsync(
        IReadOnlyCollection<Guid> conversationIds,
        Guid currentUserId,
        CancellationToken cancellationToken)
    {
        if (conversationIds.Count == 0)
            return new Dictionary<Guid, int>();

        var rows = await _dbContext.Messages
            .AsNoTracking()
            .Where(m => conversationIds.Contains(m.ConversationId)
                     && m.RecipientId == currentUserId
                     && m.ReadAt == null
                     && !m.IsDeletedByRecipient)
            .GroupBy(m => m.ConversationId)
            .Select(g => new { ConversationId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(r => r.ConversationId, r => r.Count);
    }
}


