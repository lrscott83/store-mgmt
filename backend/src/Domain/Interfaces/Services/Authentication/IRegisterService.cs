using Domain.Entities.Owners;

namespace Domain.Interfaces.Services.Authentication
{
    /// <summary>
    /// The ONE owner+store creation flow, shared by the public self-registration and by a
    /// Gestor adding a customer. Extracted from RegisterCommandHandler so both paths create the
    /// same artifacts in the same order — previously the Gestor path created only the owner,
    /// which left their customers with no store, no Billing and no modules.
    /// </summary>
    /// <remarks>
    /// <para><b>The caller owns the transaction.</b> This method never calls SaveChanges: it only
    /// stages entities, so the handler performs exactly one SaveChanges at the end and the whole
    /// registration is atomic. Nothing is written if a later step fails.</para>
    /// <para><b>Failures are thrown, not returned.</b> On any failure it throws
    /// <see cref="Application.Exceptions.ApiException"/> carrying the SAME AcctionCode the handler
    /// used to return, so the caller can rebuild the identical ResponseResult. Callers MUST catch
    /// it — letting it reach the middleware would change the HTTP status, because
    /// AuthController maps every failure ActionCode through a switch whose default arm is also
    /// BadRequest (a returned failure yields HTTP 400; an escaping exception yields HTTP 500).</para>
    /// </remarks>
    public interface IRegisterService
    {
        /// <param name="ownerDescription">Description stored on the owner. Callers pass their own
        /// value: the public registration synthesizes "Nombre de la tienda: {storeName}", while
        /// the Gestor flow passes the description its form collected.</param>
        /// <param name="reSellerLogin">Optional Gestor login. Null means "register with no Gestor".
        /// When set, the resolved Gestor is linked to the new owner. A value that matches no
        /// Gestor is TOLERATED (the owner is created unlinked) — never an error. The Gestor flow
        /// MUST pass the AUTHENTICATED ACTOR's login here, never a body-supplied value, so a
        /// Gestor cannot attach an owner to somebody else's list.</param>
        Task<Owner> RegisterAsync(
            string login,
            string password,
            string fullName,
            string cellPhone,
            string? email,
            string storeName,
            string? ownerDescription,
            string? reSellerLogin,
            CancellationToken cancellationToken);
    }
}