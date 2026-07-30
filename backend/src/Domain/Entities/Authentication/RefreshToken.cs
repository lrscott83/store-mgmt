using System.Security.Cryptography;
using System.Text;

namespace Domain.Entities.Authentication;

public class RefreshToken
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Token { get; private set; }
    public string TokenHash { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? RevokedAt { get; private set; }
    public string? ReplacedByToken { get; private set; }
    public bool IsExpired => DateTimeOffset.UtcNow >= ExpiresAt;
    public bool IsRevoked => RevokedAt is not null;
    public bool IsActive => !IsExpired && !IsRevoked;

    private RefreshToken() { } // EF Core

    public RefreshToken(Guid userId, string token, DateTimeOffset expiresAt)
    {
        Id = Guid.NewGuid();
        UserId = userId;
        Token = token;
        TokenHash = HashToken(token);
        ExpiresAt = expiresAt;
        CreatedAt = DateTimeOffset.UtcNow;
    }

    public void Revoke(string? replacedByToken = null)
    {
        RevokedAt = DateTimeOffset.UtcNow;
        ReplacedByToken = replacedByToken;
    }

    public static string HashToken(string rawToken) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}
