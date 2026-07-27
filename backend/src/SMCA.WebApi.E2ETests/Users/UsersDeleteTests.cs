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
public sealed class UsersDeleteTests
{
    private readonly AppTestFactory _f;
    public UsersDeleteTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Delete_as_super_admin_soft_deletes()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var targetLogin = $"victim-{Guid.NewGuid():N}@test.com";
        var targetId = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .DeleteAsync($"/api/v1/users/{targetId.UserId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters()
                .FirstAsync(u => u.Id == targetId.UserId);
            user.IsActive.Should().BeFalse();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, targetId.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Delete_nonexistent_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .DeleteAsync($"/api/v1/users/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Delete_without_token_returns_401()
    {
        var r = await _f.CreateClient().DeleteAsync($"/api/v1/users/{Guid.NewGuid()}");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
