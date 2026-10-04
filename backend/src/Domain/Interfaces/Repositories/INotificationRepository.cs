using Domain.Entities.Notifications;

namespace Domain.Interfaces.Repositories;

public interface INotificationRepository
{
    /// <summary>Newest first, so the bell opens on the most recent notice.</summary>
    Task<IEnumerable<Notification>> GetAllAsync(CancellationToken cancellationToken);

    Task<IEnumerable<Notification>> GetUnreadAsync(CancellationToken cancellationToken);

    Task<int> GetUnreadCountAsync(CancellationToken cancellationToken);

    Task<Notification?> GetByIdAsync(Guid notificationId, CancellationToken cancellationToken);

    Task AddAsync(Notification notification, CancellationToken cancellationToken);

    /// <summary>
    /// Stamps <c>ReadAt</c> through a direct UPDATE. A load-mutate-save would write nothing: the
    /// context is <c>NoTracking</c> by default (ApplicationDbContext.cs:49).
    /// </summary>
    /// <returns><c>true</c> when a row was actually flipped, <c>false</c> when the id is unknown.</returns>
    Task<bool> MarkAsReadAsync(Guid notificationId, CancellationToken cancellationToken);

    /// <summary>Bulk counterpart of <see cref="MarkAsReadAsync"/>; returns the number of rows flipped.</summary>
    Task<int> MarkAllAsReadAsync(CancellationToken cancellationToken);
}