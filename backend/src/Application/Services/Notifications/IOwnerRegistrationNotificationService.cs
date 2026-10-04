namespace Application.Services.Notifications;

/// <summary>
/// Raises the platform notice that tells the SuperAdmin a new owner (and its store) just registered.
/// </summary>
/// <remarks>
/// <para><b>Call it only AFTER the registration has been committed.</b> Every write on
/// <see cref="Domain.Interfaces.Repositories.INotificationRepository"/> commits internally, while
/// <see cref="Domain.Interfaces.Services.Authentication.IRegisterService"/> stages entities and never
/// commits — the handler owns the single save. Invoking this before the handler's save would flush
/// the repository's own call first, leave nothing staged for the handler, and make the handler's
/// save return 0 — failing EVERY registration (HTTP 500 on register, and owner+store never landing
/// on the Gestor flow).</para>
/// <para><b>It never throws.</b> A courtesy notice is not worth a failed registration: any failure
/// is swallowed and logged, and the registration response is unaffected.</para>
/// </remarks>
public interface IOwnerRegistrationNotificationService
{
    /// <summary>
    /// Writes one notice carrying the three facts the SuperAdmin needs to act: who registered,
    /// how to reach them, and what store they opened.
    /// </summary>
    Task NotifyAsync(
        OwnerRegistrationNotification.OwnerRegistrationTarget target,
        CancellationToken cancellationToken);
}