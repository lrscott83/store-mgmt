using FluentAssertions;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;

namespace Application.Tests.Services.Authentication;

/// <summary>
/// Consumes the committed KAT vector (docs/contracts/offline-roster-dek-kat.json, provenance dotnet-backend).
/// Unwraps using documented parameters ONLY — never calls WrapDek — proving the backend wire format is
/// reproducible from the committed vector alone (design D5, spec R18).
/// </summary>
public class StoreKeyWrapInteropTests
{
    private const string VectorFileName = "offline-roster-dek-kat.json";
    private const int TagBytes = 16;
    private const int KeyBytes = 32;

    private sealed record KatHeader(string Provenance, string BackendCommitSha, string DotnetVersion);

    private sealed class KatVector
    {
        public string Password { get; set; } = string.Empty;
        public string PasswordPreHash { get; set; } = string.Empty;
        public string WrapSalt { get; set; } = string.Empty;
        public string WrapIv { get; set; } = string.Empty;
        public int Iterations { get; set; }
        public string WrappedDek { get; set; } = string.Empty;
        public string ExpectedDek { get; set; } = string.Empty;
        public string StoreId { get; set; } = string.Empty;
        public string MasterSecret { get; set; } = string.Empty;
        [JsonPropertyName("_header")] public KatHeader Header { get; set; } = new("", "", "");
    }

    private static KatVector LoadVector()
    {
        var path = Path.Combine(AppContext.BaseDirectory, VectorFileName);
        Assert.True(File.Exists(path), $"KAT vector not copied to output: {path}");
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<KatVector>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    }

    [Fact]
    public void Unwrap_committed_vector_reproduces_expectedDek()
    {
        var v = LoadVector();

        v.Header.Provenance.Should().Be("dotnet-backend");
        v.Header.BackendCommitSha.Should().NotBeNullOrEmpty();
        v.Header.DotnetVersion.Should().NotBeNullOrEmpty();

        // KEK from documented params only: passwordPreHash + wrapSalt + iterations
        byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(v.PasswordPreHash),
            Convert.FromBase64String(v.WrapSalt),
            v.Iterations,
            HashAlgorithmName.SHA256,
            KeyBytes);

        byte[] wrapped = Convert.FromBase64String(v.WrappedDek);
        byte[] ciphertext = wrapped[..^TagBytes];
        byte[] tag = wrapped[^TagBytes..];

        byte[] dek = new byte[KeyBytes];
        using var aesGcm = new AesGcm(kek, TagBytes);
        aesGcm.Decrypt(Convert.FromBase64String(v.WrapIv), ciphertext, tag, dek);

        dek.Should().HaveCount(KeyBytes);
        dek.Should().BeEquivalentTo(Convert.FromBase64String(v.ExpectedDek));
    }

    [Fact]
    public void Hkdf_pin_reproduces_expectedDek()
    {
        var v = LoadVector();

        // Exact StoreDataKeyProvider mirror: HKDF.DeriveKey(SHA256, ikm, 32, salt: null, info: UTF8(storeId("D")))
        byte[] dek = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            Encoding.UTF8.GetBytes(v.MasterSecret),
            outputLength: KeyBytes,
            salt: null,
            Encoding.UTF8.GetBytes(Guid.Parse(v.StoreId).ToString("D")));

        dek.Should().BeEquivalentTo(Convert.FromBase64String(v.ExpectedDek));
    }

    [Fact]
    public void PasswordPreHash_independently_reproduces_from_password()
    {
        var v = LoadVector();

        // Permanent guard (R18): the vector's persisted pre-hash field must independently equal
        // Base64(SHA256(UTF8(password))) — the exact class of drift (backend and frontend agreeing
        // on a wire format but disagreeing on what feeds it) that caused this defect.
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(v.Password)))
            .Should().Be(v.PasswordPreHash);
    }

    [Fact]
    public void Iteration_drift_210001_fails_unwrap()
    {
        var v = LoadVector();

        // One-off iteration drift (210001 vs 210000) must FAIL — proves the vector guards parameter drift (R18).
        byte[] driftedKek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(v.PasswordPreHash),
            Convert.FromBase64String(v.WrapSalt),
            v.Iterations + 1,
            HashAlgorithmName.SHA256,
            KeyBytes);

        byte[] wrapped = Convert.FromBase64String(v.WrappedDek);
        byte[] ciphertext = wrapped[..^TagBytes];
        byte[] tag = wrapped[^TagBytes..];

        var act = () =>
        {
            byte[] dek = new byte[KeyBytes];
            using var aesGcm = new AesGcm(driftedKek, TagBytes);
            aesGcm.Decrypt(Convert.FromBase64String(v.WrapIv), ciphertext, tag, dek);
            return dek;
        };

        act.Should().Throw<AuthenticationTagMismatchException>();
    }
}
