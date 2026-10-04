using Domain.Common.Entities;

namespace Domain.Entities.Notifications;

/// <summary>
/// A platform-level notice addressed to a single principal — currently only the SuperAdmin.
/// </summary>
/// <remarks>
/// <para><b>Why this is NOT a <c>Message</c>.</b> <c>Message</c> is store-scoped and lives inside
/// a <c>Conversation</c> keyed uniquely on <c>(OwnerId, StoreId)</c>. A registration notice belongs
/// to no conversation, is not store-scoped (the SuperAdmin is global), and reusing the message
/// system would open one conversation per brand new store and flood the inbox.</para>
/// <para><b>Why the three facts are copied onto the row</b> rather than joined back to
/// <c>Owner</c>/<c>Store</c>. The notice is about the FACT of a registration, and the owner or
/// store may later be renamed, deactivated or soft-deleted. A notice that re-read a mutated name
/// would stop telling the truth about what happened.</para>
/// <para><b>Why no tenant column and no tenant query filter</b> (like <c>Message</c> and
/// <c>Conversation</c>): the recipient is a platform principal, not a store.</para>
/// </remarks>
public sealed class Notification : AuditableEntity<Guid>
{
    /// <summary>The owner's full name at registration time.</summary>
    public string OwnerName { get; set; }

    /// <summary>The owner's cell phone at registration time.</summary>
    public string OwnerCellPhone { get; set; }

    /// <summary>The store name at registration time.</summary>
    public string StoreName { get; set; }

    /// <summary>
    /// When the notice was raised. Distinct from the inherited audit <c>CreatedDate</c>, which is
    /// stamped from the ambient HTTP user and is therefore not a reliable record of the event time.
    /// </summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>When the recipient read it, or <c>null</c> while it is still unread (the badge).</summary>
    public DateTime? ReadAt { get; private set; }

    private Notification(Guid id, string ownerName, string ownerCellPhone, string storeName) : base(id)
    {
        OwnerName = ownerName;
        OwnerCellPhone = ownerCellPhone;
        StoreName = storeName;
        CreatedAt = DateTime.UtcNow;
    }

    public static Notification Create(string ownerName, string ownerCellPhone, string storeName)
    {
        return new Notification(Guid.NewGuid(), ownerName, ownerCellPhone, storeName);
    }

    /// <summary>Idempotent: re-reading an already-read notice keeps the original timestamp.</summary>
    public void MarkAsRead()
    {
        if (ReadAt == null)
            ReadAt = DateTime.UtcNow;
    }
}