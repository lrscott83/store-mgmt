using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using FluentAssertions;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Application.Tests.Services.Authentication;

public class OfflineVerifierServiceTests
{
    private const int ExpectedIterations = 210_000;

    [Fact]
    public void CreateVerifier_produces_16byte_salt_and_reproducible_pbkdf2()
    {
        var sut = new OfflineVerifierService();
        // Input is the persisted, decrypted OfflinePasswordPreHash (Base64(SHA256(password))) —
        // not User.Password (Argon2id PHC string). See design D1/R3.
        const string preHash = "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=";

        var result = sut.CreateVerifier(preHash);

        result.Iterations.Should().Be(ExpectedIterations);
        Convert.FromBase64String(result.Salt).Length.Should().Be(16);
        Convert.FromBase64String(result.Hash).Length.Should().Be(32);

        // Recompute independently with the documented parameters and confirm equality.
        var expected = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(preHash),
            Convert.FromBase64String(result.Salt),
            ExpectedIterations,
            HashAlgorithmName.SHA256,
            32);
        Convert.ToBase64String(expected).Should().Be(result.Hash);
    }

    [Fact]
    public void CreateVerifier_uses_a_fresh_salt_each_call()
    {
        var sut = new OfflineVerifierService();
        var a = sut.CreateVerifier("n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=");
        var b = sut.CreateVerifier("n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=");
        a.Salt.Should().NotBe(b.Salt);
        a.Hash.Should().NotBe(b.Hash);
    }
}
