using Domain.Common.Entities;

namespace Domain.Entities.Messages;

public sealed class Conversation : AuditableEntity<Guid>
{
    public Guid OwnerId { get; set; }
    public Guid StoreId { get; set; }
    public DateTime LastMessageAt { get; set; }
    public string? LastMessageContent { get; set; }

    private Conversation(Guid id, Guid ownerId, Guid storeId) : base(id)
    {
        OwnerId = ownerId;
        StoreId = storeId;
    }

    public static Conversation Create(Guid ownerId, Guid storeId)
    {
        return new Conversation(Guid.NewGuid(), ownerId, storeId);
    }

    public void UpdateLastMessage(string content)
    {
        LastMessageAt = DateTime.UtcNow;
        LastMessageContent = content;
    }
}
