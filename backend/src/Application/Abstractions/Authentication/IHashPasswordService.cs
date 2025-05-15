namespace Application.Abstractions.Authentication
{
    public interface IHashPasswordService
    {
        string HashPassword(string password);
    }
}
