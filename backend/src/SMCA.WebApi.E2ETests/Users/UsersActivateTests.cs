using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersActivateTests
{
    private readonly AppTestFactory _f;
    public UsersActivateTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// KNOWN BUG: ActivateUserHandler always sets IsActive=true regardless of request.IsActive.
    /// This test asserts the ACTUAL behavior (always activates), not the intended behavior.
    /// </summary>
    [Fact]
    public async Task Activate_sets_active_true_ignoring_request()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin);
        await UserSeed.DeactivateUserAsync(_f, target.UserId);
        try
        {
            // Sending IsActive=false but handler ignores it — always sets true
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = target.UserId, IsActive = false });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters()
                .FirstAsync(u => u.Id == target.UserId);
            user.IsActive.Should().BeTrue();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Activate_nonexistent_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = Guid.NewGuid(), IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }
}
