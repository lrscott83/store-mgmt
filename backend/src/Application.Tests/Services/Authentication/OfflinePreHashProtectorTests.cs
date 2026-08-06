using Application.Services.Authentication;
using FluentAssertions;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Application.Tests.Services.Authentication;

public class OfflinePreHashProtectorTests
{
    private const string MasterSecret = "unit-test-master-secret-not-real";

    [Fact]
    public void Protect_then_Unprotect_round_trips_to_the_SHA256_preHash()
    {
        var sut = new OfflinePreHashProtector(MasterSecret);
        var userId = Guid.NewGuid();
        const string password = "Password123";

        string envelope = sut.Protect(password, userId);
        string? recovered = sut.Unprotect(envelope, userId);

        string expectedPreHash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));
        recovered.Should().Be(expectedPreHash);
    }

    [Fact]
    public void Unprotect_with_wrong_userId_throws_AuthenticationTagMismatchException()
    {
        var sut = new OfflinePreHashProtector(MasterSecret);
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        string envelope = sut.Protect("Password123", userId);

        var act = () => sut.Unprotect(envelope, otherUserId);

        act.Should().Throw<AuthenticationTagMismatchException>();
    }

    [Fact]
    public void Unprotect_with_null_envelope_returns_null()
    {
        var sut = new OfflinePreHashProtector(MasterSecret);

        sut.Unprotect(null, Guid.NewGuid()).Should().BeNull();
    }

    [Fact]
    public void Protect_envelope_leads_with_the_pinned_version_byte()
    {
        var sut = new OfflinePreHashProtector(MasterSecret);

        string envelope = sut.Protect("Password123", Guid.NewGuid());

        byte[] raw = Convert.FromBase64String(envelope);
        raw[0].Should().Be(0x01);
    }

    [Fact]
    public void Protect_produces_a_fresh_nonce_each_call()
    {
        var sut = new OfflinePreHashProtector(MasterSecret);
        var userId = Guid.NewGuid();

        string envelopeA = sut.Protect("Password123", userId);
        string envelopeB = sut.Protect("Password123", userId);

        envelopeA.Should().NotBe(envelopeB);
    }
}
