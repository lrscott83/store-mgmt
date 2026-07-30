using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class StoreSeed
{
    public const int ManagementModuleId = 7;
    public const int UnavailableModuleId = 999999;

    public sealed record OwnerFixture(Guid OwnerId, Guid UserId);
    public sealed record StoreFixture(Guid StoreId, Guid OwnerId, Guid OwnerUserId);
    public sealed record StoresAdminFixture(Guid UserId, string Login, Guid StoreId, Guid OwnerId);
    public sealed record TenantStoreFixture(Guid TenantId, Guid StoreId, Guid OwnerId, Guid OwnerUserId);
    public sealed record StoreRow(string Name, string? Address, string? Description, bool Approved, bool IsActive);

    public static async Task<OwnerFixture> SeedOwnerAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"owner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Owner", "0000000000", login, DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, DataUtils.DefaultTenant.Id, "E2E owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        return new OwnerFixture(owner.Id, user.Id);
    }

    public static async Task<StoreFixture> SeedStoreAsync(AppTestFactory factory, string name, bool approved, IReadOnlyCollection<int>? moduleIds = null)
    {
        var owner = await SeedOwnerAsync(factory);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = Store.Create(name, owner.OwnerId, approved, DataUtils.DefaultTenant.Id);
        db.Set<Store>().Add(store);
        foreach (var moduleId in moduleIds ?? new[] { ManagementModuleId })
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, moduleId, 0, true, 0, 0, 0, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return new StoreFixture(store.Id, owner.OwnerId, owner.UserId);
    }

    public static async Task<StoresAdminFixture> SeedStoresAdminUserAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"sadmin-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E StoresAdmin", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E StoresAdmin owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"SA-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new StoresAdminFixture(user.Id, login, store.Id, owner.Id);
    }

    public static async Task<TenantStoreFixture> SeedStoreInNewTenantAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenant = Tenant.Create($"T2-{Guid.NewGuid():N}", "e2e tenant", DateTimeOffset.UtcNow);
        db.Set<Tenant>().Add(tenant);
        var login = $"t2owner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "T2 Owner", "0000000000", login, tenant.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenant.Id, "t2 owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"T2-Store-{Guid.NewGuid():N}", owner.Id, false, tenant.Id);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenant.Id));
        await db.SaveChangesAsync();
        return new TenantStoreFixture(tenant.Id, store.Id, owner.Id, user.Id);
    }

    public static async Task<bool> GetApprovedAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return (await db.Set<Store>().IgnoreQueryFilters().FirstAsync(s => s.Id == storeId)).Approved;
    }

    public static async Task<StoreRow> GetStoreRowAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var s = await db.Set<Store>().IgnoreQueryFilters().FirstAsync(x => x.Id == storeId);
        return new StoreRow(s.Name, s.Address, s.Description, s.Approved, s.IsActive);
    }

    public static async Task DeactivateStoreAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var s = await db.Set<Store>().IgnoreQueryFilters().AsTracking().FirstAsync(x => x.Id == storeId);
        s.IsActive = false;
        await db.SaveChangesAsync();
    }

    public static async Task CleanupStoreAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreRoleFeature>().RemoveRange(await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ToListAsync());
        db.Set<Store>().RemoveRange(await db.Set<Store>().IgnoreQueryFilters().Where(x => x.Id == storeId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static async Task CleanupOwnerAsync(AppTestFactory factory, Guid ownerId, Guid ownerUserId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<Owner>().RemoveRange(await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.Id == ownerId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == ownerUserId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static async Task CleanupStoreFixtureAsync(AppTestFactory factory, StoreFixture f)
    {
        await CleanupStoreAsync(factory, f.StoreId);
        await CleanupOwnerAsync(factory, f.OwnerId, f.OwnerUserId);
    }

    public static async Task CleanupStoresAdminAsync(AppTestFactory factory, StoresAdminFixture f)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreRoleFeature>().RemoveRange(await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<Store>().RemoveRange(await db.Set<Store>().IgnoreQueryFilters().Where(x => x.Id == f.StoreId).ToListAsync());
        db.Set<UserRole>().RemoveRange(await db.Set<UserRole>().IgnoreQueryFilters().Where(x => x.UserId == f.UserId).ToListAsync());
        db.Set<Owner>().RemoveRange(await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.Id == f.OwnerId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == f.UserId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static async Task CleanupTenantStoreAsync(AppTestFactory factory, TenantStoreFixture f)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreRoleFeature>().RemoveRange(await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<Store>().RemoveRange(await db.Set<Store>().IgnoreQueryFilters().Where(x => x.Id == f.StoreId).ToListAsync());
        db.Set<Owner>().RemoveRange(await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.Id == f.OwnerId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == f.OwnerUserId).ToListAsync());
        db.Set<Tenant>().RemoveRange(await db.Set<Tenant>().IgnoreQueryFilters().Where(x => x.Id == f.TenantId).ToListAsync());
        await db.SaveChangesAsync();
    }
}