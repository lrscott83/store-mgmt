using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using FluentAssertions;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Application.Tests.Services.Authentication;

public class StoreKeyWrapServiceTests
{
    private const int KeyBytes = 32;
    private const int TagBytes = 16;

    [Fact]
    public void WrapDek_round_trip_reproduces_original_dek()
    {
        var sut = new StoreKeyWrapService();
        // Input is the persisted, decrypted OfflinePasswordPreHash (Base64(SHA256(password))) —
        // not User.Password (Argon2id PHC string). See design D1/R11.
        const string preHash = "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=";

        byte[] originalDek = RandomNumberGenerator.GetBytes(KeyBytes);

        var result = sut.WrapDek(preHash, originalDek);

        // Verify output format
        Convert.FromBase64String(result.WrapSalt).Length.Should().Be(16);
        Convert.FromBase64String(result.WrapIv).Length.Should().Be(12);
        var wrapped = Convert.FromBase64String(result.WrappedDek);
        wrapped.Length.Should().Be(KeyBytes + TagBytes);

        // Reconstruct KEK with same salt
        byte[] wrapSalt = Convert.FromBase64String(result.WrapSalt);
        byte[] wrapIv = Convert.FromBase64String(result.WrapIv);
        byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(preHash),
            wrapSalt,
            210_000,
            HashAlgorithmName.SHA256,
            KeyBytes);

        // Split wrapped into ciphertext and tag
        byte[] ciphertext = wrapped[..^TagBytes];
        byte[] tag = wrapped[^TagBytes..];

        // Decrypt and verify
        byte[] decrypted = new byte[KeyBytes];
        using var aesGcm = new AesGcm(kek, TagBytes);
        aesGcm.Decrypt(wrapIv, ciphertext, tag, decrypted);

        decrypted.Should().BeEquivalentTo(originalDek);
    }

    [Fact]
    public void WrapDek_distinct_salt_iv_per_call()
    {
        var sut = new StoreKeyWrapService();
        const string preHash = "dGVzdC1oYXNo";
        byte[] dek = RandomNumberGenerator.GetBytes(KeyBytes);

        var resultA = sut.WrapDek(preHash, dek);
        var resultB = sut.WrapDek(preHash, dek);

        resultA.WrapSalt.Should().NotBe(resultB.WrapSalt);
        resultA.WrapIv.Should().NotBe(resultB.WrapIv);
        resultA.WrappedDek.Should().NotBe(resultB.WrappedDek);
    }
}
