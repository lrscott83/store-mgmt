using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Entities.Notifications;
using Domain.Interfaces.Repositories;

namespace Application.Features.Notifications.Queries.GetNotifications;

public sealed record GetNotificationsQuery : IQuery<NotificationsListDto>;

public class GetNotificationsQueryHandler : IQueryHandler<GetNotificationsQuery, NotificationsListDto>
{
    private readonly INotificationRepository _notificationRepository;

    public GetNotificationsQueryHandler(INotificationRepository notificationRepository)
    {
        _notificationRepository = notificationRepository;
    }

    public async Task<ResponseResult<NotificationsListDto>> Handle(
        GetNotificationsQuery query,
        CancellationToken cancellationToken)
    {
        // Deliberately NOT scoped by the caller: notices are addressed to the one canonical
        // SuperAdmin, and the controller is already SuperAdmin-gated. Filtering by the acting user
        // id here would hide every notice, because notices are stamped with the platform constant
        // rather than with whichever seeded SuperAdmin happens to be logged in.
        var notifications = await _notificationRepository.GetAllAsync(cancellationToken);
        int unreadCount = await _notificationRepository.GetUnreadCountAsync(cancellationToken);

        var items = new List<NotificationDto>();
        foreach (Notification notification in notifications)
        {
            items.Add(new NotificationDto
            {
                Id = notification.Id,
                OwnerName = notification.OwnerName,
                OwnerCellPhone = notification.OwnerCellPhone,
                StoreName = notification.StoreName,
                CreatedAt = notification.CreatedAt,
                // Shipped as an explicit boolean, not a nullable ReadAt: the bell needs a plain
                // "is this read" and a null-check the client would otherwise have to reimplement.
                IsRead = notification.ReadAt != null,
                ReadAt = notification.ReadAt,
            });
        }

        return ResponseResult.Success(new NotificationsListDto
        {
            Items = items,
            UnreadCount = unreadCount,
        });
    }
}

public sealed record NotificationsListDto
{
    public IReadOnlyList<NotificationDto> Items { get; set; } = [];
    public int UnreadCount { get; set; }
}

public sealed record NotificationDto
{
    public Guid Id { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public string OwnerCellPhone { get; set; } = string.Empty;
    public string StoreName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
}