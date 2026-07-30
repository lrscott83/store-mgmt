using Domain.Common.Results;

namespace Domain.Entities.Users
{
    public class UserErrors
    {
        /// <summary>
        /// Generic invalid credentials error — prevents user enumeration.
        /// Maps to HTTP 401 Unauthorized.
        /// </summary>
        public static readonly Error InvalidCredentials = new("Auth.InvalidCredentials", "Invalid credentials");

        /// <summary>
        /// Account-level inactive error — same message as InvalidCredentials.
        /// Maps to HTTP 403 Forbidden so the client can show a "contact support" page.
        /// </summary>
        public static readonly Error AccountInactive = new("Auth.AccountInactive", "Invalid credentials");

        public static readonly Error NotFound = new("User.NotFound", $"El usuario no existe.");
    }
}
