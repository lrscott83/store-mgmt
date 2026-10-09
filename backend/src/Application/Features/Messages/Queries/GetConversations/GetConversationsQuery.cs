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

        // Batched, not per conversation. Awaiting the unread count and the owner
        // recency INSIDE the loop was an N+1: two extra round trips for every row the
        // inbox lists, so the endpoint's cost grew with the number of registered
        // owners and the SuperAdmin inbox is exactly where that is felt. Two queries
        // for the whole list instead of 2N.
        var conversationIds = conversations.Select(c => c.Id).ToList();
        var unreadCounts = await _messageRepository.GetUnreadCountsAsync(conversationIds, currentUserId, cancellationToken);
        var lastOwnerMessageAt = await _messageRepository.GetLastOwnerMessageAtAsync(conversationIds, cancellationToken);

        // A missing entry means zero unread / never wrote, which is why the lookups
        // default rather than the dictionary being pre-filled.
        var result = conversations.Select(conversation => new ConversationDto
        {
            Id = conversation.Id,
            OwnerId = conversation.OwnerId,
            StoreId = conversation.StoreId,
            LastMessageAt = conversation.LastMessageAt,
            LastMessageContent = conversation.LastMessageContent,
            UnreadCount = unreadCounts.TryGetValue(conversation.Id, out var count) ? count : 0,
            LastOwnerMessageAt = lastOwnerMessageAt.TryGetValue(conversation.Id, out var at) ? at : null,
        }).ToList();

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
