using Domain.Entities.Owners;

namespace Domain.Interfaces.Services.Owners
{
    public interface ICreateOwnerService
    {
        Task<Owner> CreateOwnerAsync(string login, string password, string fullName, string cellPhone, 
            string? email, string? description);
    }
}
