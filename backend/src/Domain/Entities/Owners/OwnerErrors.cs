using Domain.Common.Results;

namespace Domain.Entities.Users
{
    public class OwnerErrors
    {
        public static readonly Error NotFound = new("Owner.NotFound", $"El usuario no existe.");
        public static readonly Error Inactive = new("Owner.Inactive", "Invalid credentials");
    }
}
