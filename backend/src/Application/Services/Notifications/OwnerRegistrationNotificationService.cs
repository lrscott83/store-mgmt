using Domain.Common.Constants;
using Domain.Entities.Notifications;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Logging;

namespace Application.Services.Notifications;

/// <inheritdoc cref="IOwnerRegistrationNotificationService"/>
/// <remarks>
/// <para><b>There is no recipient lookup.</b> The recipient is the canonical SuperAdmin
/// (<see cref="DataUtils.SuperAdminUser.Id"/>), the same constant
/// <see cref="Application.Services.Messages.OwnerWelcomeMessageService"/> already sends as. A
/// <c>GetSuperAdminIdAsync</c>-style lookup is an unordered <c>FirstOrDefault</c> over users having
/// the role and can return <c>Guid.Empty</c>, which would file the notice under nobody and make it
/// invisible in the bell forever.</para>
/// <para><b>There is no dedup key.</b> A registration notice is not repeated like a greeting: each
/// owner is registered exactly once per flow, so an unconditional insert is correct and a
/// get-or-create would only add a query.</para>
/// </remarks>
public class OwnerRegistrationNotificationService : IOwnerRegistrationNotificationService
{
    private readonly INotificationRepository _notificationRepository;
    private readonly ILogger<OwnerRegistrationNotificationService> _logger;

    public OwnerRegistrationNotificationService(
        INotificationRepository notificationRepository,
        ILogger<OwnerRegistrationNotificationService> logger)
    {
        _notificationRepository = notificationRepository;
        _logger = logger;
    }

    public async Task NotifyAsync(
        OwnerRegistrationNotification.OwnerRegistrationTarget target,
        CancellationToken cancellationToken)
    {
        // The whole body is guarded on purpose: this runs after the registration was already
        // committed and its response is already being built. Throwing here would turn a successful
        // signup into a 500 for a mere courtesy notice.
        try
        {
            Notification notification = Notification.Create(
                target.OwnerName,
                target.OwnerCellPhone,
                target.StoreName);

            await _notificationRepository.AddAsync(notification, cancellationToken);

            _logger.LogInformation(
                "Owner registration notification created: NotificationId={NotificationId} OwnerName={OwnerName} StoreName={StoreName}.",
                notification.Id, target.OwnerName, target.StoreName);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Owner registration notification could not be created for OwnerName={OwnerName} StoreName={StoreName}. The registration itself is unaffected.",
                target.OwnerName, target.StoreName);
        }
    }
}