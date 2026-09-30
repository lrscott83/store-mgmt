using Application.Features.Messages.Queries.GetMessages;

namespace Application.Abstractions.Messaging;

/// <summary>
/// Server-side push gateway for real-time owner messaging.
/// </summary>
/// <remarks>
/// Implemented in the WebApi layer on top of SignalR. Keeping only this
/// abstraction in the Application layer preserves the Clean Architecture
/// dependency direction: Application never references SMCA.WebApi.
/// Every method must be called AFTER persistence has succeeded so a push can
/// never announce a state the database does not hold.
/// </remarks>
public interface IMessagePushService
{
    /// <summary>
    /// Pushes a newly persisted message to the recipient's connected clients.
    /// </summary>
    Task NewMessageAsync(Guid recipientId, MessageDto message, CancellationToken cancellationToken);

    /// <summary>
    /// Pushes a read receipt to the message sender so their client can mark
    /// the message as read.
    /// </summary>
    Task MessageReadAsync(Guid recipientId, Guid conversationId, Guid messageId, CancellationToken cancellationToken);
}
