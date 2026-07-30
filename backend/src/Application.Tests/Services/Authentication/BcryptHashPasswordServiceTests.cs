using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using FluentAssertions;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text;

namespace Application.Tests.Services.Authentication;

/// <summary>
/// Tests for BcryptHashPasswordService covering:
/// - BCrypt hash/verify roundtrip
/// - Legacy SHA256+pepper fallback verification
/// - Legacy raw SHA256 fallback verification
/// - NeedsUpgrade detection for BCrypt vs legacy hashes
/// </summary>
public class BcryptHashPasswordServiceTests
{
    private static readonly Guid TestPepper = Guid.Parse("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
    private const int TestIterations = 6;

    private readonly AuthenticationSettings _settings;
    private readonly BcryptHashPasswordService _service;

    public BcryptHashPasswordServiceTests()
    {
        _settings = new AuthenticationSettings
        {
            Pepper = TestPepper.ToString(),
            Iterations = TestIterations
        };
        _service = new BcryptHashPasswordService(Options.Create(_settings));
    }

    #region HashPassword Tests

    [Fact]
    public void HashPassword_returns_BCrypt_format()
    {
        // Act
        var hash = _service.HashPassword("testPassword123!");

        // Assert
        hash.Should().StartWith("$2");
        hash.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void HashPassword_samePassword_differentHashes()
    {
        // Act
        var hash1 = _service.HashPassword("samePassword123!");
        var hash2 = _service.HashPassword("samePassword123!");

        // Assert — BCrypt uses a random salt, so two hashes of the same password differ
        hash1.Should().NotBe(hash2);
    }

    [Fact]
    public void HashPassword_nullPassword_shouldThrow()
    {
        // Act
        var action = () => _service.HashPassword(null!);

        // Assert — BCrypt throws ArgumentNullException for null input
        action.Should().Throw<ArgumentNullException>();
    }

    #endregion

    #region VerifyPassword Tests

    [Fact]
    public void VerifyPassword_correct_returns_true()
    {
        // Arrange
        var password = "testPassword123!";
        var hash = _service.HashPassword(password);

        // Act
        var result = _service.VerifyPassword(password, hash);

        // Assert
        result.Should().BeTrue();
    }

    [Fact]
    public void VerifyPassword_incorrect_returns_false()
    {
        // Arrange
        var hash = _service.HashPassword("correctPassword123!");

        // Act
        var result = _service.VerifyPassword("wrongPassword456!", hash);

        // Assert
        result.Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_legacySHA256Hash_returns_true()
    {
        // Arrange
        var password = "testPassword123!";
        var legacyHash = ComputeLegacySaltedHash(password, _settings.Pepper);

        // Act
        var result = _service.VerifyPassword(password, legacyHash);

        // Assert
        result.Should().BeTrue();
    }

    [Fact]
    public void VerifyPassword_legacyRawSHA256_returns_true()
    {
        // Arrange
        var password = "testPassword123!";
        var rawHash = ComputeRawSha256(password);

        // Act
        var result = _service.VerifyPassword(password, rawHash);

        // Assert
        result.Should().BeTrue();
    }

    [Fact]
    public void VerifyPassword_emptyPassword_returns_false()
    {
        // Arrange
        var hash = _service.HashPassword("nonEmptyPassword123!");

        // Act
        var result = _service.VerifyPassword("", hash);

        // Assert
        result.Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_nullPassword_throwsArgumentNullException()
    {
        // Arrange
        var hash = _service.HashPassword("testPassword123!");

        // Act
        var action = () => _service.VerifyPassword(null!, hash);

        // Assert — BCrypt throws ArgumentNullException when inputKey is null
        action.Should().Throw<ArgumentNullException>();
    }

    #endregion

    #region NeedsUpgrade Tests

    [Fact]
    public void NeedsUpgrade_BCryptHash_returns_false()
    {
        // Arrange
        var hash = _service.HashPassword("anyPassword");

        // Act
        var result = _service.NeedsUpgrade(hash);

        // Assert
        result.Should().BeFalse();
    }

    [Fact]
    public void NeedsUpgrade_legacyHash_returns_true()
    {
        // Arrange
        var legacyHash = ComputeLegacySaltedHash("anyPassword", _settings.Pepper);

        // Act
        var result = _service.NeedsUpgrade(legacyHash);

        // Assert
        result.Should().BeTrue();
    }

    [Fact]
    public void NeedsUpgrade_rawSha256_returns_true()
    {
        // Arrange
        var rawHash = ComputeRawSha256("anyPassword");

        // Act
        var result = _service.NeedsUpgrade(rawHash);

        // Assert
        result.Should().BeTrue();
    }

    #endregion

    #region Helper Methods

    /// <summary>
    /// Computes the same SHA256+pepper hash that the legacy HashPasswordService produced.
    /// Used to create stored hashes that the service must verify via its legacy fallback.
    /// </summary>
    private static string ComputeLegacySaltedHash(string password, string pepper)
    {
        var pepperBytes = Encoding.UTF8.GetBytes(pepper);
        var passwordBytes = Encoding.UTF8.GetBytes(password);

        var combined = new byte[passwordBytes.Length + pepperBytes.Length];
        Buffer.BlockCopy(passwordBytes, 0, combined, 0, passwordBytes.Length);
        Buffer.BlockCopy(pepperBytes, 0, combined, passwordBytes.Length, pepperBytes.Length);

        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(combined);

        for (int i = 1; i < TestIterations; i++)
        {
            hash = sha256.ComputeHash(hash);
        }

        return Convert.ToBase64String(hash);
    }

    /// <summary>
    /// Computes a raw SHA256 hash (no salt, no pepper) of the given password.
    /// Used to test the service's raw SHA256 fallback path.
    /// </summary>
    private static string ComputeRawSha256(string password)
    {
        return Convert.ToBase64String(
            SHA256.HashData(Encoding.UTF8.GetBytes(password)));
    }

    #endregion
}
