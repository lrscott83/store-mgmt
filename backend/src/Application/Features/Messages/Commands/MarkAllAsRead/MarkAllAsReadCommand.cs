using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Commands.MarkAllAsRead;

public sealed record MarkAllAsReadCommand : ICommand;

public class MarkAllAsReadCommandHandler : ICommandHandler<MarkAllAsReadCommand>

{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;
    private readonly IMessagePushService _messagePushService;

    public MarkAllAsReadCommandHandler(IHttpContextService httpContextService, IMessageRepository messageRepository,
        IMessagePushService messagePushService)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
        _messagePushService = messagePushService;
    }

    public async Task<ResponseResult> Handle(MarkAllAsReadCommand command, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();

        var unreadMessages = await _messageRepository.GetUnreadMessagesAsync(currentUserId, cancellationToken);

        foreach (var message in unreadMessages)
        {
            message.MarkAsRead();
            await _messageRepository.AddMessageAsync(message, cancellationToken);
        }

        // Dedupe per (sender, conversation): one read receipt per sender per
        // conversation is enough to let their client mark the thread as read,
        // instead of N identical events. The most recent message id is sent as
        // the reference point.
        var receipts = unreadMessages
            .GroupBy(m => new { m.SenderId, m.ConversationId })
            .Select(g => g.OrderByDescending(m => m.SentAt).First());

        foreach (var message in receipts)
        {
            await _messagePushService.MessageReadAsync(
                message.SenderId, message.ConversationId, message.Id, cancellationToken);
        }

        return ResponseResult.Success(true);
    }
}
