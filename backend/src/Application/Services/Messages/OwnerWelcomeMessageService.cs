using Application.Abstractions.Messaging;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Messages;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Logging;

namespace Application.Services.Messages;

/// <inheritdoc cref="IOwnerWelcomeMessageService"/>
/// <remarks>
/// <para><b>Why the sender is a constant and not a lookup.</b> <c>GetSuperAdminIdAsync</c> runs
/// <c>FirstOrDefaultAsync</c> over users having the SuperAdmin role with no ordering, so it can
/// return <c>Guid.Empty</c> (or an arbitrary SuperAdmin) — a message attributed to nobody. The
/// platform sender is a well-known constant (<see cref="DataUtils.SuperAdminUser.Id"/>), the same
/// id used as the audit stamp on seeded rows, so it is used directly.</para>
/// <para><b>Why get-or-create.</b> There is a UNIQUE index on <c>(OwnerId, StoreId)</c>
/// (ConversationEntityTypeConfiguration.cs:15). A blind insert on every call would raise a unique
/// violation the second time the same owner+store pair is greeted.</para>
/// </remarks>
public class OwnerWelcomeMessageService : IOwnerWelcomeMessageService
{
    private readonly IMessageRepository _messageRepository;
    private readonly ILogger<OwnerWelcomeMessageService> _logger;

    public OwnerWelcomeMessageService(
        IMessageRepository messageRepository,
        ILogger<OwnerWelcomeMessageService> logger)
    {
        _messageRepository = messageRepository;
        _logger = logger;
    }

    public async Task SendAsync(
        Guid ownerUserId,
        string ownerFullName,
        Guid storeId,
        CancellationToken cancellationToken)
    {
        // The whole body is guarded on purpose: this runs after the registration was already
        // committed and its response is already being built. Throwing here would turn a successful
        // signup into a 500 for a mere courtesy message.
        try
        {
            if (ownerUserId == Guid.Empty || storeId == Guid.Empty || string.IsNullOrWhiteSpace(ownerFullName))
            {
                _logger.LogWarning(
                    "Owner welcome message skipped: incomplete target (OwnerUserId={OwnerUserId}, StoreId={StoreId}, HasFullName={HasFullName}).",
                    ownerUserId, storeId, !string.IsNullOrWhiteSpace(ownerFullName));
                return;
            }

            Conversation conversation = await _messageRepository
                .GetConversationByOwnerAndStoreAsync(ownerUserId, storeId, cancellationToken)
                ?? await CreateConversationAsync(ownerUserId, storeId, cancellationToken);

            string content = OwnerWelcomeMessage.Render(ownerFullName.Trim());

            Message message = Message.Create(
                conversation.Id,
                DataUtils.SuperAdminUser.Id,
                MessageSenderType.SuperAdmin,
                ownerUserId,
                storeId,
                content);

            await _messageRepository.AddMessageAsync(message, cancellationToken);

            // Both existing write paths (SendMessageCommand.cs:69-70, BroadcastMessageCommand.cs)
            // call UpdateLastMessage right after inserting. Skipping it would leave the conversation
            // with a stale preview and pin it at the bottom of the ordering
            // (GetConversationsAsync orders by LastMessageAt).
            conversation.UpdateLastMessage(content);
            await _messageRepository.UpdateConversationAsync(conversation, cancellationToken);

            _logger.LogInformation(
                "Owner welcome message sent to OwnerUserId={OwnerUserId} StoreId={StoreId} ConversationId={ConversationId}.",
                ownerUserId, storeId, conversation.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Owner welcome message could not be sent to OwnerUserId={OwnerUserId} StoreId={StoreId}. The registration itself is unaffected.",
                ownerUserId, storeId);
        }
    }

    private async Task<Conversation> CreateConversationAsync(
        Guid ownerUserId,
        Guid storeId,
        CancellationToken cancellationToken)
    {
        Conversation conversation = Conversation.Create(ownerUserId, storeId);
        await _messageRepository.AddConversationAsync(conversation, cancellationToken);
        return conversation;
    }
}
