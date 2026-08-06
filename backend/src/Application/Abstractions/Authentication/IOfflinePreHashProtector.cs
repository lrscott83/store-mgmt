namespace Application.Abstractions.Authentication;

public interface IOfflinePreHashProtector
{
    string Protect(string password, Guid userId);
    string? Unprotect(string? envelope, Guid userId);
}
