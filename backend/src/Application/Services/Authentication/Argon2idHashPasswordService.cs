using Application.Abstractions.Authentication;
using Isopoh.Cryptography.Argon2;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication;

public sealed class Argon2idHashPasswordService : IHashPasswordService
{
    private readonly AuthenticationSettings _settings;

    public Argon2idHashPasswordService(IOptions<AuthenticationSettings> settings)
    {
        _settings = settings.Value;
    }

    public string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(_settings.Argon2SaltBytes);

        var config = new Argon2Config
        {
            Type = Argon2Type.HybridAddressing,
            Version = Argon2Version.Nineteen,
            TimeCost = _settings.Argon2TimeCost,
            MemoryCost = _settings.Argon2MemoryKib,
            Lanes = _settings.Argon2Parallelism,
            Threads = _settings.Argon2Parallelism,
            HashLength = _settings.Argon2HashBytes,
            Password = Encoding.UTF8.GetBytes(password),
            Salt = salt,
            Secret = Encoding.UTF8.GetBytes(_settings.Pepper),
        };

        return Argon2.Hash(config);
    }

    public bool VerifyPassword(string password, string storedHash)
    {
        if (string.IsNullOrWhiteSpace(storedHash))
            return false;

        try
        {
            return Argon2.Verify(storedHash, password, _settings.Pepper);
        }
        catch
        {
            return false;
        }
    }
}
