using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Common.Enums;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Queries.GetMessages;

public sealed record GetMessagesQuery(Guid ConversationId) : IQuery<IEnumerable<MessageDto>>;

public class GetMessagesQueryHandler : IQueryHandler<GetMessagesQuery, IEnumerable<MessageDto>>
{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;

    public GetMessagesQueryHandler(IHttpContextService httpContextService, IMessageRepository messageRepository)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
    }

    public async Task<ResponseResult<IEnumerable<MessageDto>>> Handle(GetMessagesQuery query, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();
        var isSuperAdmin = _httpContextService.IsSuperAdmin;

        var conversation = await _messageRepository.GetConversationAsync(query.ConversationId, cancellationToken);

        if (conversation == null)
            throw new ArgumentException("Conversation not found");

        if (!isSuperAdmin && conversation.OwnerId != currentUserId)
            throw new UnauthorizedAccessException();

        var messages = await _messageRepository.GetMessagesAsync(query.ConversationId, currentUserId, cancellationToken);

        var result = messages.Select(m => new MessageDto
        {
            Id = m.Id,
            ConversationId = m.ConversationId,
            SenderId = m.SenderId,
            SenderType = m.SenderType,
            RecipientId = m.RecipientId,
            StoreId = m.StoreId,
            Content = m.Content,
            SentAt = m.SentAt,
            ReadAt = m.ReadAt
        });

        return ResponseResult.Success(result);
    }
}

public sealed record MessageDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public MessageSenderType SenderType { get; set; }
    public Guid RecipientId { get; set; }
    public Guid StoreId { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
    public DateTime? ReadAt { get; set; }
}
