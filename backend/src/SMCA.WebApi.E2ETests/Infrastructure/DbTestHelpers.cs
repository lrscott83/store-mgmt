using System.Net.Http.Headers;
using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Authentication;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreUsages;
using Domain.Entities.StoreUsers;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Outbox;
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

    /// <summary>
    /// Data-only reset for the shared e2e database (spec R2). Deletes accumulated test rows
    /// from every business/data table in FK-safe order (children before parents — every FK in
    /// the model is DeleteBehavior.Restrict, so order matters), preserving the migration seed
    /// rows (DefaultTenant, seeded admin User + its UserRole, Role, Feature, Module,
    /// StorePaymentStatus, SystemConfiguration). The database itself is never dropped —
    /// replaces the DROP DATABASE mechanism (user-approved 2026-08-08).
    /// <para>
    /// Uses ExecuteDeleteAsync deliberately: it issues DELETE SQL directly, so it neither
    /// loads entities nor falls into the NoTracking trap (ApplicationDbContext sets
    /// QueryTrackingBehavior.NoTracking globally). IgnoreQueryFilters is required because the
    /// tenant query filters would otherwise hide rows from the DELETE.
    /// </para>
    /// </summary>
    public static async Task ResetDataAsync(ApplicationDbContext db)
    {
        // FK-free / leaf tables first.
        await db.Set<RefreshToken>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<OutboxMessage>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<StoreUsage>().IgnoreQueryFilters().ExecuteDeleteAsync();

        // Store children (before Store).
        await db.Set<StorePayment>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<StoreRoleFeature>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<StoreUser>().IgnoreQueryFilters().ExecuteDeleteAsync();

        // Commerce subtree (empty in E2E, but keep the reset complete): InventoryEntryCost
        // references both InventoryEntry and OrderItem, so it must go before both.
        await db.Set<Domain.Entities.InventoryEntryCosts.InventoryEntryCost>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<Domain.Entities.OrderItems.OrderItem>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<Domain.Entities.Orders.Order>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<Domain.Entities.InventoryEntries.InventoryEntry>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<Domain.Entities.Products.Product>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<Domain.Entities.ProductCategories.ProductCategory>().IgnoreQueryFilters().ExecuteDeleteAsync();

        // Owner subtree (before Owner/User).
        await db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<Domain.Entities.ReSellers.ReSeller>().IgnoreQueryFilters().ExecuteDeleteAsync();

        // UserRole → Owner → User: keep the migration-seeded admin user and its SuperAdmin role.
        await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(ur => ur.UserId != DataUtils.SuperAdminUser.Id || ur.RoleId != (int)RoleType.SuperAdmin)
            .ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters().ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id != DataUtils.SuperAdminUser.Id)
            .ExecuteDeleteAsync();

        // Tenant: tests create tenants; keep only the migration-seeded DefaultTenant.
        await db.Set<Tenant>().IgnoreQueryFilters()
            .Where(t => t.Id != DataUtils.DefaultTenant.Id)
            .ExecuteDeleteAsync();
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

    /// <summary>
    /// Deactivates the Owner row belonging to <paramref name="userId"/>.
    /// <para>
    /// Uses ExecuteUpdateAsync deliberately. ApplicationDbContext sets
    /// QueryTrackingBehavior.NoTracking globally, so loading the Owner with a query,
    /// mutating it and calling SaveChangesAsync writes nothing — silently, with no
    /// exception. ExecuteUpdateAsync issues the UPDATE directly and cannot fall into
    /// that trap.
    /// </para>
    /// </summary>
    public static async Task DeactivateOwnerByUserIdAsync(AppTestFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<Owner>()
            .IgnoreQueryFilters()
            .Where(o => o.UserId == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.IsActive, false));
    }

    public static HttpClient AuthedClient(AppTestFactory factory, Guid userId, string login)
    {
        var client = factory.CreateClient();
        var token = AuthTestHelpers.MintToken(factory, userId, login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}