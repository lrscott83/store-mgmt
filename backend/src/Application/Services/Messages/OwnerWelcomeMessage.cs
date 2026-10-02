using System.Globalization;
using Domain.Entities.Owners;

namespace Application.Services.Messages;

/// <summary>
/// The welcome-greeting POLICY, kept separate from the service that performs the write so both
/// registration handlers decide identically whether a greeting is owed.
/// </summary>
/// <remarks>
/// The message text is product-owned and is reproduced byte for byte: same wording, same emoji,
/// same four lines. Do not reword, shorten, translate or reflow it. The rendered greeting is ~330
/// characters, well inside the 4000-character limit on <c>Message.Content</c>
/// (MessageEntityTypeConfiguration.cs:13).
/// </remarks>
public static class OwnerWelcomeMessage
{
    /// <summary>
    /// The greeting, with <c>{0}</c> replaced by the owner's full name.
    /// <para>
    /// The newlines are explicit <c>\n</c> escapes rather than literal line breaks on purpose: a
    /// CRLF checkout would otherwise bake <c>\r\n</c> into the stored message and make the text
    /// differ between developer machines and the Linux build.
    /// </para>
    /// </summary>
    public const string Template =
        "¡Hola, {0}! 👋\n" +
        "Te damos la bienvenida. Tu tienda ya está lista y puedes empezar a vender desde el primer momento.\n" +
        "Estamos aquí para ayudarte a hacer crecer tu negocio. Si te surge cualquier duda o quieres dejarnos una sugerencia, escríbenos por aquí con todo el gusto.\n" +
        "¡Mucho éxito!";

    /// <summary>Renders <see cref="Template"/> for the given owner full name.</summary>
    public static string Render(string ownerFullName)
        => string.Format(CultureInfo.CurrentCulture, Template, ownerFullName);

    /// <summary>
    /// Whether the principal that was just registered is an OwnerAdmin — the only principal that
    /// gets the greeting. A Gestor or a platform admin is never a chat participant, so greeting one
    /// would open a conversation nobody will ever read.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The discriminator is <c>Owner.Guest</c> because it is the only principal-shaped flag the
    /// returned <see cref="Owner"/> carries without an extra role query: the entity default is
    /// <c>true</c> (Owner.cs:14), and <c>CreateOwnerService</c> assigns <c>false</c> to exactly the
    /// OwnerAdmin principals it creates (CreateOwnerService.cs:45-47). The role itself
    /// (<c>RoleType.OwnerAdmin</c>) is written by the same method a few lines later
    /// (CreateOwnerService.cs:51) but is not reachable from the returned entity —
    /// <c>Owner.User.UserRoles</c> is not loaded, so reading it would mean a second query per
    /// registration just to re-derive what the caller already knows it created.
    /// </para>
    /// <para>
    /// TODAY THIS IS ALWAYS TRUE for a principal produced by
    /// <see cref="Domain.Interfaces.Services.Authentication.IRegisterService"/>, because
    /// <c>CreateOwnerService</c> hardcodes <c>RoleType.OwnerAdmin</c> — that service has no
    /// ReSeller/SuperAdmin branch, and a Gestor is created by
    /// <c>Administration/ReSellers/Commands/CreateReSeller</c>, which never calls it. The check is
    /// kept as an explicit guard rather than dropped, so that widening the registration flow to
    /// other principals later cannot silently start greeting them.
    /// </para>
    /// </remarks>
    public static bool ShouldGreet(Owner? owner)
        => owner is { Guest: false } && owner.User is not null;

    /// <summary>
    /// Where the greeting must land, or <c>null</c> when no greeting is owed — either the principal
    /// is not a greeted OwnerAdmin, or the registration left something the greeting needs missing
    /// (no user navigation, no user id, no selected store, no name). One place decides, so the two
    /// registration handlers cannot drift apart.
    /// </summary>
    public static OwnerWelcomeTarget? Resolve(Owner? owner)
    {
        if (!ShouldGreet(owner))
            return null;

        // The null-forgiving accessors are safe: ShouldGreet proved owner and owner.User are non-null.
        string? fullName = owner!.User!.FullName;
        Guid storeId = owner.User.SelectedStoreId;

        if (owner.UserId == Guid.Empty || storeId == Guid.Empty || string.IsNullOrWhiteSpace(fullName))
            return null;

        return new OwnerWelcomeTarget(owner.UserId, fullName.Trim(), storeId);
    }

    /// <summary>The three facts a greeting needs, all resolved from the registered <see cref="Owner"/>.</summary>
    /// <param name="OwnerUserId">The owner's USER id — never the <c>Owner</c> entity id.</param>
    /// <param name="OwnerFullName">The owner's <c>User.FullName</c>.</param>
    /// <param name="StoreId">The owner's selected store, which scopes the conversation.</param>
    public sealed record OwnerWelcomeTarget(Guid OwnerUserId, string OwnerFullName, Guid StoreId);
}
