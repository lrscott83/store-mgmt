using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class AuthzSeed
{
    public const int StoresFeatureId = 73;
    public const int ManagementModuleId = 7;

    public sealed record OwnerAdminFixture(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId);
    public sealed record StoreUserFixture(Guid UserId, string Login, Guid OwnerUserId, Guid OwnerId, Guid StoreId, Guid TenantId);

    public static async Task<OwnerAdminFixture> SeedOwnerAdminAsync(AppTestFactory factory, bool withManagementModule)
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

        if (withManagementModule)
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new OwnerAdminFixture(user.Id, login, owner.Id, store.Id, tenantId);
    }

    public static async Task<OwnerAdminFixture> SeedTenantMismatchOwnerAdminAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"mismatch-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Mismatch", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Mismatch owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"MM-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, Guid.NewGuid()));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new OwnerAdminFixture(user.Id, login, owner.Id, store.Id, tenantId);
    }

    public static async Task<StoreUserFixture> SeedStoreUserAsync(AppTestFactory factory, int? grantedFeatureId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var ownerLogin = $"suo-{Guid.NewGuid():N}@test.com";
        var ownerUser = User.Create(ownerLogin, DbTestHelpers.HashPassword("Password123"), "E2E SU Owner", "0000000000", ownerLogin, tenantId);
        db.Set<User>().Add(ownerUser);
        var owner = Owner.Create(ownerUser.Id, false, tenantId, "E2E SU owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"SU-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));

        var login = $"suser-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E StoreUser", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId));
        if (grantedFeatureId is int fid)
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(store.Id, (int)RoleType.StoreUser, fid, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new StoreUserFixture(user.Id, login, ownerUser.Id, owner.Id, store.Id, tenantId);
    }

    public static async Task CleanupStoreGraphAsync(AppTestFactory factory, Guid storeId, params Guid[] userIds)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await RemoveWhere<StoreRoleFeature>(db, x => x.StoreId == storeId);
        await RemoveWhere<StoreUser>(db, x => x.StoreId == storeId);
        await RemoveWhere<StoreModule>(db, x => x.StoreId == storeId);
        var stores = await db.Set<Store>().IgnoreQueryFilters().Where(s => s.Id == storeId).ToListAsync();
        var ownerIds = stores.Select(s => s.OwnerId).ToList();
        db.Set<Store>().RemoveRange(stores);
        await db.SaveChangesAsync();
        await RemoveWhere<Owner>(db, o => ownerIds.Contains(o.Id));
        foreach (var uid in userIds)
        {
            await RemoveWhere<UserRole>(db, r => r.UserId == uid);
            await RemoveWhere<User>(db, u => u.Id == uid);
        }
    }

    private static async Task RemoveWhere<T>(ApplicationDbContext db, System.Linq.Expressions.Expression<Func<T, bool>> pred) where T : class
    {
        db.Set<T>().RemoveRange(await db.Set<T>().IgnoreQueryFilters().Where(pred).ToListAsync());
        await db.SaveChangesAsync();
    }
}