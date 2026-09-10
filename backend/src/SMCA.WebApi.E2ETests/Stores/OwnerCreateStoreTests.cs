using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

// Owner store-creation matrix (user-approved 2026-09-09, owner-multistores-store-creation):
// POST /v1/stores admits a second caller class — an OwnerAdmin whose SELECTED store has the
// MultiStores module (14) active after billing filtering. Contract:
//   - OwnerAdmin + {7,14} + own/zero-Guid OwnerId → 201, modules inherited from selected store,
//     Approved forced true, plan Superior, trial clock today, SelectedStoreId NOT repointed.
//   - OwnerAdmin without 14 (missing OR billing-Vencido) → 403, nothing persisted.
//   - OwnerAdmin with foreign OwnerId → 403, nothing persisted.
//   - StoreUser (even holding feature 73) → 403 at handler gate 2, nothing persisted.
//   - SuperAdmin branch unchanged (body controls everything — complements untouchable StoreCreateTests).
// Coupling: pin the handler two-gate rule (D1) and the end-to-end contract on the real API.
[Collection("e2e")]
public sealed class OwnerCreateStoreTests
{
    private readonly AppTestFactory _f;
    public OwnerCreateStoreTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int MultiStoresModuleId = (int)ModuleType.MultiStores;
    private const int ManagementModuleId = (int)ModuleType.Management;

    private sealed record OwnerMultiStoresFixture(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId);

    /// <summary>
    /// LOCAL seed helper — does NOT modify the shared StoreSeed/AuthzSeed classes (E2E-untouchable rule).
    /// Creates user + owner + store (PaymentStartDate = today ⇒ billing AlDia by default) with
    /// StoreModules {7, 14}, UserRole OwnerAdmin, SelectedStoreId = store. Optionally pushes the
    /// store's PaymentStartDate back (Vencido billing pin).
    /// </summary>
    private static async Task<OwnerMultiStoresFixture> SeedOwnerWithMultiStoresAsync(AppTestFactory factory, DateOnly? paymentStartDate = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"omulti-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E OwnerMultiStores", "0000000000", login, tenantId);
        db.Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E OwnerMultiStores owner");
        db.Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"OM-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId,
            paymentStartDate ?? DateOnly.FromDateTime(DateTime.UtcNow));
        db.Add(store);
        await db.SaveChangesAsync();

        // Management (7) free + MultiStores (14) paid — mirrors the real DB module configuration.
        db.Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        db.Add(StoreModule.Create(store.Id, MultiStoresModuleId, 5, false, 5, 0, 0, tenantId));
        db.Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new OwnerMultiStoresFixture(user.Id, login, owner.Id, store.Id, tenantId);
    }

    private sealed record StoreCreateBody(
        Guid OwnerId,
        string Name,
        string? Address,
        string? Description,
        bool Approved,
        int[] ModuleIds);

    private static StoreCreateBody OwnerBody(string name) => new(
        Guid.Empty, name, "", "", true, Array.Empty<int>());

    private static StoreCreateBody ForeignBody(Guid ownerId, string name) => new(
        ownerId, name, null, null, true, new[] { ManagementModuleId });

    [Fact]
    public async Task OC01_without_token_returns_401()
    {
        var response = await _f.CreateClient().PostAsJsonAsync("/api/v1/stores", OwnerBody($"S-{Guid.NewGuid():N}"));
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task OC02_store_user_with_stores_feature_gets_403_and_nothing_persisted()
    {
        // Pins handler gate 2: the StoreUser passes the ACTION gate (feature 73 via StoreRoleFeature)
        // and a data-valid request (owner + module ids), but is not an OwnerAdmin/SuperAdmin →
        // the handler returns 403 BEFORE any repository call. 403, never 400 (R2.14 defense).
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", ForeignBody(f.OwnerId, name));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }

    [Fact]
    public async Task OC03_owner_admin_without_multistores_gets_403_and_nothing_persisted()
    {
        // SeedStoresAdminUserAsync exposes OwnerAdmin + module 7 only (no 14) — the pre-existing
        // "owner without MultiStores" pin, now produced by the handler's module check (gate 2 body).
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PostAsJsonAsync("/api/v1/stores", OwnerBody(name));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
            var user = await db.Set<User>().IgnoreQueryFilters().FirstAsync(u => u.Id == sa.UserId);
            user.SelectedStoreId.Should().Be(sa.StoreId);
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }

    [Fact]
    public async Task OC04_owner_with_multistores_creates_own_store_201_and_inherits_modules()
    {
        var f = await SeedOwnerWithMultiStoresAsync(_f);
        var name = $"OM-Created-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", OwnerBody(name));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            created = body.Data!.Id;
            response.Headers.Location.Should().NotBeNull();
            response.Headers.Location!.AbsolutePath.Should().Be($"/api/v1/stores/{created}");

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().FirstAsync(s => s.Id == created);
            store.Approved.Should().BeTrue();            // decision 6: forced approved
            store.IsActive.Should().BeTrue();
            store.OwnerId.Should().Be(f.OwnerId);        // derived from the caller
            store.StorePlanId.Should().Be((int)StorePlanType.Superior);
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow)); // trial clock today

            var moduleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(m => m.StoreId == created).Select(m => m.ModuleId).OrderBy(m => m).ToListAsync();
            moduleIds.Should().Equal(ManagementModuleId, MultiStoresModuleId); // inheritance pin (7, 14)

            (await db.Set<StoreRoleFeature>().IgnoreQueryFilters().AnyAsync(srf => srf.StoreId == created)).Should().BeTrue();

            var creator = await db.Set<User>().IgnoreQueryFilters().FirstAsync(u => u.Id == f.UserId);
            creator.SelectedStoreId.Should().Be(f.StoreId); // NOT repointed
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }

    [Fact]
    public async Task OC05_owner_with_multistores_foreign_owner_id_gets_403_and_nothing_persisted()
    {
        var f = await SeedOwnerWithMultiStoresAsync(_f);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", ForeignBody(Guid.NewGuid(), name));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }

    [Fact]
    public async Task OC06_superadmin_regression_body_controls_modules_and_approved()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        var name = $"SA-Created-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", ForeignBody(owner.OwnerId, name) with
                {
                    Approved = false,
                    ModuleIds = new[] { ManagementModuleId }
                });
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            created = body.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().FirstAsync(s => s.Id == created);
            store.Approved.Should().BeFalse(); // body controls approved on the SuperAdmin branch
            store.OwnerId.Should().Be(owner.OwnerId);
            var moduleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(m => m.StoreId == created).Select(m => m.ModuleId).ToListAsync();
            moduleIds.Should().Equal(ManagementModuleId);
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task OC07_owner_with_multistores_but_vencido_billing_gets_403_and_nothing_persisted()
    {
        // PaymentStartDate 2 years ago ⇒ billing Vencido ⇒ FilterForBilling keeps only free
        // modules ⇒ 14 is filtered out ⇒ the MultiStores gate fails (session-parity pin).
        var f = await SeedOwnerWithMultiStoresAsync(_f,
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-2)));
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", OwnerBody(name));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }
}