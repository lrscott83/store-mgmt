using Application.Services.Authentication;
using FluentAssertions;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Application.Tests.Services.Authentication;

public class StoreDataKeyProviderTests
{
    private const string MasterSecret = "0D5D3E5F-3E7C-4C1A-9E2B-6F1E9C4A7B20";

    [Fact]
    public void GetDek_same_storeId_returns_same_dek()
    {
        var sut = new StoreDataKeyProvider(MasterSecret);
        var storeId = Guid.NewGuid();

        var dek1 = sut.GetDek(storeId);
        var dek2 = sut.GetDek(storeId);

        dek1.Should().BeEquivalentTo(dek2);
    }

    [Fact]
    public void GetDek_different_storeId_returns_different_deks()
    {
        var sut = new StoreDataKeyProvider(MasterSecret);
        var storeA = Guid.NewGuid();
        var storeB = Guid.NewGuid();

        var dekA = sut.GetDek(storeA);
        var dekB = sut.GetDek(storeB);

        dekA.Should().NotBeEquivalentTo(dekB);
    }

    [Fact]
    public void GetDek_produces_32_bytes()
    {
        var sut = new StoreDataKeyProvider(MasterSecret);
        var dek = sut.GetDek(Guid.NewGuid());
        dek.Length.Should().Be(32);
    }

    [Fact]
    public void GetDek_known_answer_matches_independent_vector()
    {
        // Known-answer vector independently computed per RFC 5869 (HKDF-Extract/Expand via raw
        // HMAC-SHA256) with Python 3.13 `hmac` and PowerShell `HMACSHA256` — neither uses
        // HKDF.DeriveKey, so this is NOT self-referential. Inputs pinned to production:
        // MasterSecret const below, fixed storeId, salt: null -> 32 zero bytes (RFC 5869 §2.2).
        var storeId = Guid.Parse("3F2504E0-4F89-41D3-9A0C-0305E82C3301");
        const string expectedHex = "1947de72a86a46962bf851db33476e3db6681fab9cac9f7701488ab80f0ff21f";

        var dek = new StoreDataKeyProvider(MasterSecret).GetDek(storeId);

        dek.Should().HaveCount(32);
        dek.Should().BeEquivalentTo(Convert.FromHexString(expectedHex));
    }

    [Fact]
    public void Constructor_throws_on_empty_secret()
    {
        var act = () => new StoreDataKeyProvider("");
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Constructor_throws_on_whitespace_secret()
    {
        var act = () => new StoreDataKeyProvider("   ");
        act.Should().Throw<ArgumentException>();
    }
}
