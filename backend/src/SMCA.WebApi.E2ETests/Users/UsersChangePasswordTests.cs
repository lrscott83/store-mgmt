using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersChangePasswordTests
{
    private readonly AppTestFactory _f;
    public UsersChangePasswordTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Change_own_password_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/change-password",
                    new { UserId = id, OldPassword = "Password123", NewPassword = "NewPass123!" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Change_password_as_other_user_without_permission_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        var victim = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/users/change-password",
                    new { UserId = victim.UserId, OldPassword = "", NewPassword = "Hacked123!" });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, victim.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }
}
