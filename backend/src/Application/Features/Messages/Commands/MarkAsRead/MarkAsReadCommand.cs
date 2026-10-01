using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Commands.MarkAsRead;

public sealed record MarkAsReadCommand(Guid MessageId) : ICommand;

public class MarkAsReadCommandHandler : ICommandHandler<MarkAsReadCommand>

{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;
    private readonly IMessagePushService _messagePushService;

    public MarkAsReadCommandHandler(IHttpContextService httpContextService, IMessageRepository messageRepository,
        IMessagePushService messagePushService)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
        _messagePushService = messagePushService;
    }

    public async Task<ResponseResult> Handle(MarkAsReadCommand command, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();

        var message = await _messageRepository.GetMessageAsync(command.MessageId, cancellationToken);

        if (message == null)
            throw new ArgumentException("Message not found");

        if (message.RecipientId != currentUserId)
            throw new UnauthorizedAccessException();

        message.MarkAsRead();
        await _messageRepository.UpdateMessageAsync(message, cancellationToken);

        // Notify the original sender that the recipient read the message.
        await _messagePushService.MessageReadAsync(
            message.SenderId, message.ConversationId, message.Id, cancellationToken);

        return ResponseResult.Success(true);
    }
}
