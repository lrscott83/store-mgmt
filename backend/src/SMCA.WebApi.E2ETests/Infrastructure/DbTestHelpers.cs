using System.Net.Http.Headers;
using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class DbTestHelpers
{
    // Lazily built from the same appsettings.Tests.json the app-under-test loads last
    // (AppTestFactory.cs:21-24), so the seeded hash and the app's verifier share one
    // pepper and one parameter set. Signature of HashPassword is frozen — see ADR-5.
    private static readonly Argon2idHashPasswordService Hasher = CreateHasher();

    private static Argon2idHashPasswordService CreateHasher()
    {
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(
                Path.Combine(AppContext.BaseDirectory, "appsettings.Tests.json"),
                optional: false,
                reloadOnChange: false)
            .AddEnvironmentVariables()
            .Build();

        var settings = new AuthenticationSettings();
        configuration.GetSection(AuthenticationSettings.SectionName).Bind(settings);
        return new Argon2idHashPasswordService(Options.Create(settings));
    }

    public static string HashPassword(string password)
        => Hasher.HashPassword(password);

    public static async Task<Guid> SeedSuperAdminAsync(AppTestFactory factory, string login, string password)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var user = User.Create(login, HashPassword(password), "E2E Super Admin", "0000000000", login,
            DataUtils.DefaultTenant.Id);
        var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect(password, user.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.SuperAdmin, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return user.Id;
    }

    public static async Task<Guid> SeedInactiveUserAsync(AppTestFactory factory, string login, string password)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var user = User.Create(login, HashPassword(password), "E2E Inactive User", "0000000000", login,
            DataUtils.DefaultTenant.Id);
        user.IsActive = false;
        var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect(password, user.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.SuperAdmin, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return user.Id;
    }

    public static async Task<User?> GetUserByLoginAsync(AppTestFactory factory, string login)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<User>().IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Login == login);
    }

    public static async Task CleanupUserAsync(AppTestFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Must delete Owner first (FK_Owner_User_UserId) before User
        var owners = await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.UserId == userId).ToListAsync();
        if (owners.Count > 0)
        {
            // Also clean up ReSellerOwner if present
            var ownerIds = owners.Select(o => o.Id).ToList();
            var reSellerOwners = await db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>()
                .IgnoreQueryFilters().Where(rso => ownerIds.Contains(rso.OwnerId)).ToListAsync();
            db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>().RemoveRange(reSellerOwners);
        }
        db.Set<Owner>().RemoveRange(owners);

        var roles = await db.Set<UserRole>().IgnoreQueryFilters().Where(x => x.UserId == userId).ToListAsync();
        db.Set<UserRole>().RemoveRange(roles);
        var users = await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == userId).ToListAsync();
        db.Set<User>().RemoveRange(users);
        await db.SaveChangesAsync();
    }

    public static async Task CleanupTenantCascadeAsync(AppTestFactory factory, Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await RemoveByTenantAsync<StoreRoleFeature>(db, tenantId);
        await RemoveByTenantAsync<StoreModule>(db, tenantId);
        await RemoveByTenantAsync<Store>(db, tenantId);
        await RemoveByTenantAsync<UserRole>(db, tenantId);
        await RemoveByTenantAsync<Owner>(db, tenantId);
        await RemoveByTenantAsync<User>(db, tenantId);

        var tenants = await db.Set<Tenant>().IgnoreQueryFilters().Where(x => x.Id == tenantId).ToListAsync();
        db.Set<Tenant>().RemoveRange(tenants);
        await db.SaveChangesAsync();
    }

    private static async Task RemoveByTenantAsync<T>(ApplicationDbContext db, Guid tenantId) where T : class
    {
        var rows = await db.Set<T>().IgnoreQueryFilters()
            .Where(x => EF.Property<Guid>(x, "TenantId") == tenantId).ToListAsync();
        db.Set<T>().RemoveRange(rows);
    }

    public sealed record UserFixture(Guid UserId, string Login);

    public static async Task<UserFixture> SeedUserWithRoleAsync(AppTestFactory factory, int roleId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"role{roleId}-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, HashPassword("Password123"), "E2E Role User", "0000000000", login, DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, roleId, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return new UserFixture(user.Id, login);
    }

    public static HttpClient AuthedClient(AppTestFactory factory, Guid userId, string login)
    {
        var client = factory.CreateClient();
        var token = AuthTestHelpers.MintToken(factory, userId, login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}