using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

/// <summary>
/// Roster bundle self-description contract (roster-any-filename):
/// the frontend's offline import no longer derives the store id from the
/// exported FILE NAME — it reads a plaintext <c>meta.json</c> envelope the
/// export writes INSIDE the archive, whose <c>storeId</c> comes from the
/// bundle JSON itself. That makes the backend's bundle response the single
/// source of truth for the whole chain, and this test pins its load-bearing
/// fields:
///   1. <c>storeId</c> must be present and non-empty, and equal the store
///      the export was requested for — the envelope copies it verbatim, so a
///      rename here (or a scope change) would surface offline as an
///      unexplained <c>WrongPasswordError</c>, the exact failure mode the
///      filename contract existed to prevent.
///   2. <c>bundleId</c> must be a GUID — it is the offline anti-replay
///      marker's identity (<c>roster-store.ts</c>), independent of any file
///      name.
///   3. <c>formatVersion</c> must be a known positive version.
///
/// These fields were previously only indirectly exercised (asserted as
/// side effects of other tests); a dedicated contract test makes the
/// rename-from-filename change observable at the API boundary it depends on.
/// </summary>
[Collection("e2e")]
public sealed class RosterEnvelopeContractTests
{
    private readonly AppTestFactory _f;
    public RosterEnvelopeContractTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Export_roster_bundle_is_self_described_for_any_filename_import()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var roster = body.Data!;

            // 1. storeId: the envelope's storeId is copied from this field.
            //    Empty here would mean "import impossible without the file
            //    name" — the exact regression this change removes.
            roster.StoreId.Should().NotBeEmpty();
            roster.StoreId.Should().Be(owner.StoreId);

            // 2. bundleId: GUID-shaped, the anti-replay identity.
            Guid.TryParse(roster.BundleId, out var bundleId).Should().BeTrue();
            bundleId.Should().NotBe(Guid.Empty);

            // 3. formatVersion: positive, so the client can evolve the
            //    container format and still recognize old exports.
            roster.FormatVersion.Should().BePositive();

            // 4. Every user points at the same store: the roster is
            //    store-scoped, and a user carrying a different
            //    selectedStoreId would break the offline login's store
            //    resolution once the file name no longer disambiguates.
            roster.Users.Should().NotBeEmpty();
            foreach (var user in roster.Users)
            {
                user.SelectedStoreId.Should().Be(owner.StoreId);
            }
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }
}
