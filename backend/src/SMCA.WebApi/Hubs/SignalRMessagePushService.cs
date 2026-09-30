using Application.Abstractions.Messaging;
using Application.Features.Messages.Queries.GetMessages;
using Microsoft.AspNetCore.SignalR;

namespace SMCA.WebApi.Hubs;

/// <summary>
/// SignalR-backed implementation of <see cref="IMessagePushService"/>.
/// Pushes to the per-user group established by <see cref="MessageHub"/>.
/// </summary>
public sealed class SignalRMessagePushService : IMessagePushService
{
    private readonly IHubContext<MessageHub> _hubContext;

    public SignalRMessagePushService(IHubContext<MessageHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task NewMessageAsync(Guid recipientId, MessageDto message, CancellationToken cancellationToken)
    {
        return _hubContext.Clients
            .Group(MessageGroupKey.ForUserId(recipientId))
            .SendAsync("ReceiveMessage", message, cancellationToken);
    }

    public Task MessageReadAsync(Guid recipientId, Guid conversationId, Guid messageId, CancellationToken cancellationToken)
    {
        return _hubContext.Clients
            .Group(MessageGroupKey.ForUserId(recipientId))
            .SendAsync("MessageRead", new { conversationId, messageId }, cancellationToken);
    }
}
