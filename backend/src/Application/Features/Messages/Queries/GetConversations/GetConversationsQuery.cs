using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.Messages.Queries.GetConversations;

public sealed record GetConversationsQuery : IQuery<IEnumerable<ConversationDto>>;

public class GetConversationsQueryHandler : IQueryHandler<GetConversationsQuery, IEnumerable<ConversationDto>>
{
    private readonly IHttpContextService _httpContextService;
    private readonly IMessageRepository _messageRepository;

    public GetConversationsQueryHandler(IHttpContextService httpContextService, IMessageRepository messageRepository)
    {
        _httpContextService = httpContextService;
        _messageRepository = messageRepository;
    }

    public async Task<ResponseResult<IEnumerable<ConversationDto>>> Handle(GetConversationsQuery query, CancellationToken cancellationToken)
    {
        var currentUserId = _httpContextService.UserExternalId.ToGuid();
        var isSuperAdmin = _httpContextService.IsSuperAdmin;

        var conversations = await _messageRepository.GetConversationsAsync(currentUserId, isSuperAdmin, cancellationToken);

        var result = new List<ConversationDto>();
        foreach (var conversation in conversations)
        {
            result.Add(new ConversationDto
            {
                Id = conversation.Id,
                OwnerId = conversation.OwnerId,
                StoreId = conversation.StoreId,
                LastMessageAt = conversation.LastMessageAt,
                LastMessageContent = conversation.LastMessageContent,
                UnreadCount = await _messageRepository.GetUnreadCountAsync(conversation.Id, currentUserId, cancellationToken),
                LastOwnerMessageAt = await _messageRepository.GetLastOwnerMessageAtAsync(conversation.Id, conversation.OwnerId, cancellationToken),
            });
        }

        return ResponseResult.Success<IEnumerable<ConversationDto>>(result);
    }
}

public sealed record ConversationDto
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public Guid StoreId { get; set; }
    public DateTime LastMessageAt { get; set; }
    public string? LastMessageContent { get; set; }
    public int UnreadCount { get; set; }
    /// <summary>
    /// When the owner last wrote, <c>null</c> when they never have. Unlike
    /// <see cref="LastMessageAt"/> this does NOT move when the SuperAdmin replies.
    /// </summary>
    public DateTime? LastOwnerMessageAt { get; set; }
}
