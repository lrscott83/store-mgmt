using Domain.Entities.Owners;

namespace Application.Services.Notifications;

/// <summary>
/// The registration-notice POLICY, kept separate from the service that performs the write so both
/// registration handlers decide identically whether a notice is owed.
/// </summary>
/// <remarks>
/// Mirrors <see cref="Application.Services.Messages.OwnerWelcomeMessage"/> deliberately: one place
/// decides, so the public self-registration and the Gestor-created owner cannot drift apart.
/// </remarks>
public static class OwnerRegistrationNotification
{
    /// <summary>
    /// The three facts the notice carries, or <c>null</c> when the registration left something it
    /// needs missing — a notice showing an empty phone or an empty store name is worse than none.
    /// </summary>
    /// <param name="owner">The owner the registration just produced, used for the full name.</param>
    /// <param name="cellPhone">
    /// The owner's cell phone, taken from the COMMAND, not from <paramref name="owner"/>: the
    /// <c>Owner</c> entity carries no phone at all, and reading it off the navigated
    /// <c>owner.User</c> instead would make the notice depend on whether that navigation was loaded.
    /// </param>
    /// <param name="storeName">The store name, taken from the command's request body.</param>
    public static OwnerRegistrationTarget? Resolve(Owner? owner, string? cellPhone, string? storeName)
    {
        string? fullName = owner?.User?.FullName;

        if (owner is null
            || string.IsNullOrWhiteSpace(fullName)
            || string.IsNullOrWhiteSpace(cellPhone)
            || string.IsNullOrWhiteSpace(storeName))
        {
            return null;
        }

        return new OwnerRegistrationTarget(fullName.Trim(), cellPhone.Trim(), storeName.Trim());
    }

    /// <summary>The three facts a notice needs.</summary>
    public sealed record OwnerRegistrationTarget(string OwnerName, string OwnerCellPhone, string StoreName);
}