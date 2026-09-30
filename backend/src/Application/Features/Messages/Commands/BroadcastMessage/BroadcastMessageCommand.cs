using System.Net;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Messages;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Commands.BroadcastMessage;

public sealed record BroadcastMessageCommand(string Content) : ICommand;

public class BroadcastMessageCommandHandler : ICommandHandler<BroadcastMessageCommand>

{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;

    public BroadcastMessageCommandHandler(IHttpContextService httpContextService, IMessageRepository messageRepository)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
    }

    public async Task<ResponseResult> Handle(BroadcastMessageCommand command, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();
        var isSuperAdmin = _httpContextService.IsSuperAdmin;

        if (!isSuperAdmin)
            throw new ApiException("Forbidden", HttpStatusCode.Forbidden);

        if (string.IsNullOrWhiteSpace(command.Content))
            throw new ArgumentException("Content is required");

        var ownerIds = await _messageRepository.GetAllOwnerIdsAsync(cancellationToken);

        foreach (var ownerId in ownerIds)
        {
            var storeIds = await _messageRepository.GetStoreIdsByOwnerAsync(ownerId, cancellationToken);

            foreach (var storeId in storeIds)
            {
                var conversation = await _messageRepository.GetConversationByOwnerAndStoreAsync(ownerId, storeId, cancellationToken);

                if (conversation == null)
                {
                    conversation = Conversation.Create(ownerId, storeId);
                    await _messageRepository.AddConversationAsync(conversation, cancellationToken);
                }

                var message = Message.Create(
                    conversation.Id,
                    currentUserId,
                    MessageSenderType.SuperAdmin,
                    ownerId,
                    storeId,
                    command.Content.Trim());

                await _messageRepository.AddMessageAsync(message, cancellationToken);
                conversation.UpdateLastMessage(message.Content);
                await _messageRepository.UpdateConversationAsync(conversation, cancellationToken);
            }
        }

        return ResponseResult.Success(true);
    }
}
