using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class BillingSeed
{
    public const int ManagementModuleId = 7;
    public const int StatisticsModuleId = 6;

    public sealed record SeededStore(
        Guid UserId,
        string Login,
        Guid OwnerId,
        Guid StoreId,
        Guid TenantId,
        Guid? ReSellerId = null);

    /// <summary>
    /// Creates a store with no PaymentStartDate (null), only the free Management module, and OwnerAdmin role.
    /// </summary>
    public static async Task<SeededStore> SeedFreeStoreAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"free-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Free Store", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Free Store Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Free-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate: null);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        await db.SaveChangesAsync();

        return new SeededStore(user.Id, login, owner.Id, store.Id, tenantId);
    }

    /// <summary>
    /// Creates a store with the given PaymentStartDate, both free (Management) and paid (Statistics) modules, and OwnerAdmin role.
    /// </summary>
    public static async Task<SeededStore> SeedPaidStoreAsync(
        AppTestFactory factory,
        DateOnly paymentStartDate,
        float paidModulePrice = 1000f,
        float paidModulePercentDiscount = 0f)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"paid-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Paid Store", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Paid Store Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Paid-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Free module: Management (id=7), PriceIncluded=true
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        // Paid module: Statistics (id=6), PriceIncluded=false
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, StatisticsModuleId, paidModulePrice, false, paidModulePrice, 0, paidModulePercentDiscount, tenantId));
        await db.SaveChangesAsync();

        return new SeededStore(user.Id, login, owner.Id, store.Id, tenantId);
    }

    /// <summary>
    /// Creates a ReSeller user + ReSeller entity + Owner (with ReSellerOwner) + Store with a paid module.
    /// </summary>
    public static async Task<SeededStore> SeedPaidStoreWithReSellerAsync(
        AppTestFactory factory,
        DateOnly paymentStartDate,
        float paidModulePrice,
        float paidModulePercentDiscount,
        float reSellerPercentDiscount)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"reseller-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E ReSeller", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(user.Id, true, 0, reSellerPercentDiscount, tenantId, "E2E ReSeller");
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E ReSeller Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        db.Set<ReSellerOwner>().Add(ReSellerOwner.Create(reSeller.Id, owner.Id, 0, reSellerPercentDiscount, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"ReSeller-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Free module: Management (id=7), PriceIncluded=true
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        // Paid module: Statistics (id=6), PriceIncluded=false
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, StatisticsModuleId, paidModulePrice, false, paidModulePrice, 0, paidModulePercentDiscount, tenantId));
        await db.SaveChangesAsync();

        return new SeededStore(user.Id, login, owner.Id, store.Id, tenantId, reSeller.Id);
    }

    /// <summary>
    /// Creates a StorePayment with status Paid for the given store.
    /// </summary>
    public static async Task SeedPaymentAsync(
        AppTestFactory factory,
        Guid storeId,
        float amount,
        Guid? reSellerId,
        float reSellerPercentDiscountPrice,
        bool byReSeller,
        Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var now = DateTimeOffset.UtcNow;
        var reSellerAmount = byReSeller ? amount * (reSellerPercentDiscountPrice / 100f) : 0f;

        var payment = StorePayment.Create(
            storeId,
            (int)StorePaymentStatusType.Paid,
            amount,
            now,
            now.Year,
            now.Month,
            tenantId,
            reSellerId,
            reSellerPercentDiscountPrice,
            0f,                   // reSellerDiscountPrice (no fixed discount)
            reSellerAmount,
            byReSeller);

        db.Set<StorePayment>().Add(payment);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Removes all seeded data in reverse dependency order:
    /// StorePayment → StoreModule → StoreRoleFeature → Store → ReSellerOwner → Owner → ReSeller → UserRole → User.
    /// </summary>
    public static async Task CleanupAsync(AppTestFactory factory, SeededStore seeded)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // 1. StorePayment
        var payments = await db.Set<StorePayment>().IgnoreQueryFilters()
            .Where(sp => sp.StoreId == seeded.StoreId).ToListAsync();
        db.Set<StorePayment>().RemoveRange(payments);

        // 2. StoreModule
        var modules = await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == seeded.StoreId).ToListAsync();
        db.Set<StoreModule>().RemoveRange(modules);

        // 3. StoreRoleFeature — created by PUT /api/v1/stores/{id} handler
        var roleFeatures = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(srf => srf.StoreId == seeded.StoreId).ToListAsync();
        db.Set<StoreRoleFeature>().RemoveRange(roleFeatures);

        // 4. Store
        var stores = await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == seeded.StoreId).ToListAsync();
        db.Set<Store>().RemoveRange(stores);

        // 4. ReSellerOwner
        var reSellerOwners = await db.Set<ReSellerOwner>().IgnoreQueryFilters()
            .Where(rso => rso.OwnerId == seeded.OwnerId).ToListAsync();
        db.Set<ReSellerOwner>().RemoveRange(reSellerOwners);

        // 6. Owner
        var owners = await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => o.Id == seeded.OwnerId).ToListAsync();
        db.Set<Owner>().RemoveRange(owners);

        // 7. ReSeller (only if present)
        if (seeded.ReSellerId.HasValue)
        {
            var reSellers = await db.Set<ReSeller>().IgnoreQueryFilters()
                .Where(r => r.Id == seeded.ReSellerId.Value).ToListAsync();
            db.Set<ReSeller>().RemoveRange(reSellers);
        }

        // 8. UserRole
        var userRoles = await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(ur => ur.UserId == seeded.UserId).ToListAsync();
        db.Set<UserRole>().RemoveRange(userRoles);

        // 9. User
        var users = await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == seeded.UserId).ToListAsync();
        db.Set<User>().RemoveRange(users);

        await db.SaveChangesAsync();
    }
}
