using Domain.Common.Results;

namespace Domain.Entities.Stores
{
    public class StoreErrors
    {
        public static readonly Error Inactive = new("Store.Inactive", "La tienda está inactiva.");
        public static readonly Error NotCreated = new("Store.NotCreated", "La tienda no pudo ser creada.");
    }
}
