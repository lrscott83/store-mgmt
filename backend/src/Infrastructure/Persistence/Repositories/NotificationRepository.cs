using Domain.Entities.Notifications;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories;

public class NotificationRepository : INotificationRepository
{
    private readonly ApplicationDbContext _dbContext;

    public NotificationRepository(ApplicationDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IEnumerable<Notification>> GetAllAsync(CancellationToken cancellationToken)
    {
        return await _dbContext.Notifications
            .AsNoTracking()
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Notification>> GetUnreadAsync(CancellationToken cancellationToken)
    {
        return await _dbContext.Notifications
            .AsNoTracking()
            .Where(n => n.ReadAt == null)
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public Task<int> GetUnreadCountAsync(CancellationToken cancellationToken)
    {
        return _dbContext.Notifications.AsNoTracking().CountAsync(n => n.ReadAt == null, cancellationToken);
    }

    public Task<Notification?> GetByIdAsync(Guid notificationId, CancellationToken cancellationToken)
    {
        return _dbContext.Notifications
            .AsNoTracking()
            .FirstOrDefaultAsync(n => n.Id == notificationId, cancellationToken);
    }

    /// <summary>
    /// Commits internally, like every <c>MessageRepository</c> write method. Callers MUST invoke
    /// this AFTER their own single SaveChanges — see
    /// <see cref="Application.Services.Notifications.IOwnerRegistrationNotificationService"/>.
    /// </summary>
    public async Task AddAsync(Notification notification, CancellationToken cancellationToken)
    {
        _dbContext.Notifications.Add(notification);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// ExecuteUpdateAsync, not load-then-save: the context is NoTracking by default, so a loaded
    /// entity mutated in place would silently write nothing.
    /// </summary>
    public async Task<bool> MarkAsReadAsync(Guid notificationId, CancellationToken cancellationToken)
    {
        // ReadAt has a private setter, so it is written by the query rather than by the entity.
        int flipped = await _dbContext.Notifications
            .Where(n => n.Id == notificationId && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, DateTime.UtcNow), cancellationToken);

        return flipped > 0;
    }

    public Task<int> MarkAllAsReadAsync(CancellationToken cancellationToken)
    {
        return _dbContext.Notifications
            .Where(n => n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, DateTime.UtcNow), cancellationToken);
    }
}