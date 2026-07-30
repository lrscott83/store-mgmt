using Domain.Common.Results;

namespace Domain.Entities.Users
{
    public class ReSellerErrors
    {
        public static readonly Error NotFound = new("User.NotFound", $"El usuario no existe.");
        public static readonly Error Inactive = new("User.Inactive", "Invalid credentials");
    }
}
