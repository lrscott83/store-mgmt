namespace Application.Abstractions.Authentication
{
    public interface IHashPasswordService
    {
        string HashPassword(string password);
        bool VerifyPassword(string password, string storedHash);
    }
}
