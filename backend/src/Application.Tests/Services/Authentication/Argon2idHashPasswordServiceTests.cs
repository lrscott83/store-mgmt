using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using FluentAssertions;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text;

namespace Application.Tests.Services.Authentication;

/// <summary>
/// Tests for Argon2idHashPasswordService covering:
/// - Argon2id PHC-format hash/verify roundtrip
/// - Random salt per call (same password hashes differently each time)
/// - Pepper participation (a hash under one pepper does not verify under another)
/// - VerifyPassword never throws for malformed/foreign-format stored values
/// </summary>
public class Argon2idHashPasswordServiceTests
{
    private const string TestPepperA = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890";
    private const string TestPepperB = "00000000-0000-0000-0000-000000000000";

    private readonly AuthenticationSettings _settings;
    private readonly Argon2idHashPasswordService _service;

    public Argon2idHashPasswordServiceTests()
    {
        _settings = new AuthenticationSettings
        {
            Pepper = TestPepperA,
            Argon2MemoryKib = 8192,
            Argon2TimeCost = 2,
            Argon2Parallelism = 1,
            Argon2SaltBytes = 16,
            Argon2HashBytes = 32,
        };
        _service = new Argon2idHashPasswordService(Options.Create(_settings));
    }

    #region HashPassword Tests

    [Fact]
    public void HashPassword_returns_Argon2id_PHC_format()
    {
        var hash = _service.HashPassword("testPassword123!");

        hash.Should().StartWith("$argon2id$");
    }

    [Fact]
    public void HashPassword_samePassword_differentHashes()
    {
        var hash1 = _service.HashPassword("samePassword123!");
        var hash2 = _service.HashPassword("samePassword123!");

        // Argon2id uses a fresh random salt per call, so two hashes of the same password differ
        hash1.Should().NotBe(hash2);
    }

    #endregion

    #region VerifyPassword Tests

    [Fact]
    public void VerifyPassword_correct_returns_true()
    {
        var password = "testPassword123!";
        var hash = _service.HashPassword(password);

        var result = _service.VerifyPassword(password, hash);

        result.Should().BeTrue();
    }

    [Fact]
    public void VerifyPassword_incorrect_returns_false()
    {
        var hash = _service.HashPassword("correctPassword123!");

        var result = _service.VerifyPassword("wrongPassword456!", hash);

        result.Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_nullStoredHash_returns_false_without_throwing()
    {
        var action = () => _service.VerifyPassword("anyPassword123!", null!);

        action.Should().NotThrow();
        _service.VerifyPassword("anyPassword123!", null!).Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_emptyStoredHash_returns_false_without_throwing()
    {
        var action = () => _service.VerifyPassword("anyPassword123!", "");

        action.Should().NotThrow();
        _service.VerifyPassword("anyPassword123!", "").Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_bcryptShapedStoredHash_returns_false_without_throwing()
    {
        const string bcryptShaped = "$2a$11$abcdefghijklmnopqrstuuVzYy0nY8w1e6q1r6i8kFQ6f1e6q1r6i";

        var action = () => _service.VerifyPassword("anyPassword123!", bcryptShaped);

        action.Should().NotThrow();
        _service.VerifyPassword("anyPassword123!", bcryptShaped).Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_rawSha256StoredHash_returns_false_without_throwing()
    {
        var rawSha256 = Convert.ToBase64String(
            SHA256.HashData(Encoding.UTF8.GetBytes("anyPassword123!")));

        var action = () => _service.VerifyPassword("anyPassword123!", rawSha256);

        action.Should().NotThrow();
        _service.VerifyPassword("anyPassword123!", rawSha256).Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_malformedTruncatedStoredHash_returns_false_without_throwing()
    {
        const string truncated = "$argon2id$v=19$m=8192,t=2,p=1$notvalid";

        var action = () => _service.VerifyPassword("anyPassword123!", truncated);

        action.Should().NotThrow();
        _service.VerifyPassword("anyPassword123!", truncated).Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_hashedUnderDifferentPepper_returns_false()
    {
        var hash = _service.HashPassword("testPassword123!");

        var otherPepperSettings = new AuthenticationSettings
        {
            Pepper = TestPepperB,
            Argon2MemoryKib = _settings.Argon2MemoryKib,
            Argon2TimeCost = _settings.Argon2TimeCost,
            Argon2Parallelism = _settings.Argon2Parallelism,
            Argon2SaltBytes = _settings.Argon2SaltBytes,
            Argon2HashBytes = _settings.Argon2HashBytes,
        };
        var otherPepperService = new Argon2idHashPasswordService(Options.Create(otherPepperSettings));

        var result = otherPepperService.VerifyPassword("testPassword123!", hash);

        result.Should().BeFalse();
    }

    #endregion
}
