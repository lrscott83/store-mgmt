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

    [Fact]
    public async Task Activate_false_deactivates_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin);
        await UserSeed.DeactivateUserAsync(_f, target.UserId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = target.UserId, IsActive = false });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters()
                .FirstAsync(u => u.Id == target.UserId);
            user.IsActive.Should().BeFalse();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Activate_true_activates_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin);
        await UserSeed.DeactivateUserAsync(_f, target.UserId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = target.UserId, IsActive = true });
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
    public async Task Activate_nonexistent_returns_404()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = Guid.NewGuid(), IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body!.Errors.Should().NotBeEmpty();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Activate_as_store_user_with_users_feature_returns_403()
    {
        var actor = await AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users);
        var victim = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = victim.UserId, IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body!.Errors.Should().NotBeEmpty();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, victim.UserId);
        }
    }
}
