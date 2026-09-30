using Domain.Common.Entities;
using Domain.Common.Enums;

namespace Domain.Entities.Messages;

public sealed class Message : AuditableEntity<Guid>
{
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public MessageSenderType SenderType { get; set; }
    public Guid RecipientId { get; set; }
    public Guid StoreId { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
    public DateTime? ReadAt { get; set; }
    public bool IsDeletedBySender { get; set; } = false;
    public bool IsDeletedByRecipient { get; set; } = false;

    private Message(Guid id, Guid conversationId, Guid senderId, MessageSenderType senderType,
        Guid recipientId, Guid storeId, string content) : base(id)
    {
        ConversationId = conversationId;
        SenderId = senderId;
        SenderType = senderType;
        RecipientId = recipientId;
        StoreId = storeId;
        Content = content;
        SentAt = DateTime.UtcNow;
    }

    public static Message Create(Guid conversationId, Guid senderId, MessageSenderType senderType,
        Guid recipientId, Guid storeId, string content)
    {
        return new Message(Guid.NewGuid(), conversationId, senderId, senderType, recipientId, storeId, content);
    }

    public void MarkAsRead()
    {
        if (ReadAt == null)
            ReadAt = DateTime.UtcNow;
    }

    public void SoftDelete(Guid userId)
    {
        if (userId == SenderId)
            IsDeletedBySender = true;
        if (userId == RecipientId)
            IsDeletedByRecipient = true;
    }
}
