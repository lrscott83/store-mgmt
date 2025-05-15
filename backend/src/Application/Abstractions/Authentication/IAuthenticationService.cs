using Domain.Common.Results;

namespace Application.Abstractions.Authentication
{
    public interface IAuthenticationService
    {
        Task<Result<Guid>> IsValidUserAsync(string login, string password);
    }
}
