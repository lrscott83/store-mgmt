using Domain.Common.Results;

namespace Domain.Entities.Stores
{
    public class StoreErrors
    {
        public static readonly Error Inactive = new("Store.Inactive", "Invalid credentials");
        public static readonly Error NotCreated = new("Store.NotCreated", "La tienda no pudo ser creada.");
        public static readonly Error NotFound = new("Store.NotFound", "The store was not found.");
    }
}
