using System.Net;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.Features.Messages.Queries.GetMessages;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Messages;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Commands.SendMessage;

public sealed record SendMessageCommand(Guid ConversationId, Guid OwnerId, Guid StoreId, string Content)
    : ICommand<MessageDto>;

public class SendMessageCommandHandler : ICommandHandler<SendMessageCommand, MessageDto>
{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;

    public SendMessageCommandHandler(IHttpContextService httpContextService, IMessageRepository messageRepository)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
    }

    public async Task<ResponseResult<MessageDto>> Handle(SendMessageCommand command, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();
        var isSuperAdmin = _httpContextService.IsSuperAdmin;

        if (string.IsNullOrWhiteSpace(command.Content))
            throw new ValidationException("Content is required");

        var conversation = await _messageRepository.GetConversationAsync(command.ConversationId, cancellationToken);

        if (conversation == null)
        {
            if (command.StoreId == Guid.Empty)
                throw new ValidationException("StoreId is required to start a new conversation");

            var owner = await _messageRepository.GetSuperAdminIdAsync(cancellationToken);

            conversation = Conversation.Create(
                isSuperAdmin ? command.OwnerId : currentUserId,
                command.StoreId);
            await _messageRepository.AddConversationAsync(conversation, cancellationToken);
        }

        if (!isSuperAdmin && conversation.OwnerId != currentUserId)
            throw new ApiException("Forbidden", HttpStatusCode.Forbidden);

        var recipientId = isSuperAdmin ? conversation.OwnerId : await _messageRepository.GetSuperAdminIdAsync(cancellationToken);
        var senderType = isSuperAdmin ? MessageSenderType.SuperAdmin : MessageSenderType.Owner;

        var message = Message.Create(
            conversation.Id,
            currentUserId,
            senderType,
            recipientId,
            conversation.StoreId,
            command.Content.Trim());

        await _messageRepository.AddMessageAsync(message, cancellationToken);
        conversation.UpdateLastMessage(message.Content);
        await _messageRepository.UpdateConversationAsync(conversation, cancellationToken);

        return ResponseResult.Success(new MessageDto
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderType = message.SenderType,
            RecipientId = message.RecipientId,
            StoreId = message.StoreId,
            Content = message.Content,
            SentAt = message.SentAt,
            ReadAt = message.ReadAt
        });
    }
}
