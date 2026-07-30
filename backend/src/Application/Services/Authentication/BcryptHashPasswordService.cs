using Application.Abstractions.Authentication;
using Microsoft.Extensions.Options;

namespace Application.Services.Authentication;

public class BcryptHashPasswordService : IHashPasswordService
{
    private readonly AuthenticationSettings _settings;

    public BcryptHashPasswordService(IOptions<AuthenticationSettings> settings)
    {
        _settings = settings.Value;
    }

    public string HashPassword(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password, workFactor: _settings.Iterations);
    }

    public bool VerifyPassword(string password, string storedHash)
    {
        // First try BCrypt verification
        if (storedHash.StartsWith('$'))
            return BCrypt.Net.BCrypt.Verify(password, storedHash);

        // Legacy SHA256+pepper verification for migrated accounts
        var legacyHash = LegacyHash(password);
        if (storedHash == legacyHash)
            return true;

        // Legacy raw SHA256 (no salt, no pepper)
        var rawHash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(password)));
        return storedHash == rawHash;
    }

    /// <summary>
    /// Indicates whether the stored hash needs upgrade to BCrypt format.
    /// BCrypt hashes always start with '$'.
    /// </summary>
    public bool NeedsUpgrade(string storedHash)
    {
        return !storedHash.StartsWith('$');
    }

    private string LegacyHash(string password)
    {
        var pepperBytes = System.Text.Encoding.UTF8.GetBytes(_settings.Pepper);
        var passwordBytes = System.Text.Encoding.UTF8.GetBytes(password);

        var combined = new byte[passwordBytes.Length + pepperBytes.Length];
        Buffer.BlockCopy(passwordBytes, 0, combined, 0, passwordBytes.Length);
        Buffer.BlockCopy(pepperBytes, 0, combined, passwordBytes.Length, pepperBytes.Length);

        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var hash = sha256.ComputeHash(combined);

        for (int i = 1; i < _settings.Iterations; i++)
        {
            hash = sha256.ComputeHash(hash);
        }

        return Convert.ToBase64String(hash);
    }
}
