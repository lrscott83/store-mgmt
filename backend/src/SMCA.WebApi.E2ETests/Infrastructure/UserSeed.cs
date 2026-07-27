using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class UserSeed
{
    public sealed record UserWithRolesFixture(
        Guid UserId,
        string Login,
        Guid OwnerId,
        Guid StoreId,
        List<int> RoleIds);

    /// <summary>
    /// Creates a User with the specified roles (no Owner/Store graph).
    /// </summary>
    public static async Task<DbTestHelpers.UserFixture> SeedUserWithRolesAsync(AppTestFactory factory, params int[] roleIds)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"u-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E User", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        foreach (var roleId in roleIds)
            db.Set<UserRole>().Add(UserRole.Create(user.Id, roleId, tenantId));
        await db.SaveChangesAsync();
        return new DbTestHelpers.UserFixture(user.Id, login);
    }

    /// <summary>
    /// Creates a User with Owner+Store+Management module + OwnerAdmin role.
    /// This grants access to UsersAdmin and ProfileAdmin features.
    /// </summary>
    public static async Task<UserWithRolesFixture> SeedOwnerAdminWithStoreAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"oadmin-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E OwnerAdmin", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E OwnerAdmin owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"OA-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, AuthzSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new UserWithRolesFixture(user.Id, login, owner.Id, store.Id, new() { (int)RoleType.OwnerAdmin });
    }

    /// <summary>
    /// Sets a user as inactive (for soft-delete / includeInactive tests).
    /// </summary>
    public static async Task DeactivateUserAsync(AppTestFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = await db.Set<User>().IgnoreQueryFilters().FirstAsync(u => u.Id == userId);
        user.IsActive = false;
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Removes User + UserRoles for the given userId.
    /// </summary>
    public static async Task CleanupUserAsync(AppTestFactory factory, Guid userId)
        => await DbTestHelpers.CleanupUserAsync(factory, userId);
}
