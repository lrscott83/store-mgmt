using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersCreateGapTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // The create handler gate is SuperAdmin || ReSeller — a ReSeller actor can create an owner.
    [Fact]
    public async Task Create_owner_as_reseller_returns_200()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        var newLogin = $"owner-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).PostAsJsonAsync("/api/v1/Owners", new
            {
                Login = newLogin, Password = "Password123", FullName = "E2E Owner",
                Cellphone = "0000000000", ReSellerId = (Guid?)null, Email = (string?)null, Description = "e2e"
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            if (created is not null) newTenantId = created.TenantId;
        }
        finally
        {
            if (newTenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, newTenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }
}