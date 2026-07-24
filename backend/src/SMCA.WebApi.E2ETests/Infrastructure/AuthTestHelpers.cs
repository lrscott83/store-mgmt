using Application.Abstractions.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class AuthTestHelpers
{
    /// <summary>
    /// Mint a JWT token for a given user using the app's real IJwtProvider.
    /// </summary>
    public static string MintToken(AppTestFactory factory, Guid userId, string login)
    {
        using var scope = factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtProvider>();
        return jwt.GenerateToken(userId, login);
    }

    /// <summary>
    /// Create an HttpClient pre-configured with a Bearer token.
    /// </summary>
    public static HttpClient BearerClient(AppTestFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    /// <summary>
    /// Seed an active user (IsActive = true) with SuperAdmin role for E2E tests.
    /// </summary>
    public static async Task<Guid> SeedActiveUserAsync(AppTestFactory factory, string login)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Active User", "0000000000", login,
            DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.SuperAdmin, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return user.Id;
    }

    /// <summary>
    /// Cleanup a user and their roles by userId.
    /// </summary>
    public static async Task CleanupUserAsync(AppTestFactory factory, Guid userId)
    {
        await DbTestHelpers.CleanupUserAsync(factory, userId);
    }
}