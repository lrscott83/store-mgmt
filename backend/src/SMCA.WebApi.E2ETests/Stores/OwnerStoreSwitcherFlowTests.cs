using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
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

/// <summary>
/// owner-multistores-switcher-flow — NEW coverage (2026-09-15), purely additive:
/// NO existing E2E file is modified (E2E-untouchable rule).
///
/// The header store switcher is fed by GET /v1/auth/me → StoreList (OwnerAdmin
/// branch of GetMeQueryHandler) and switching is PUT /v1/stores { storeId }
/// (SetMyStoreCommand). This suite pins the FULL chain the owner experiences:
///
///   SW1  POST /v1/stores (owner + selected store has MultiStores) → 201 AND the
///        new store is IMMEDIATELY visible in /me StoreList as { Id, Name,
///        IsActive=true }, while SelectedStoreId still points at the original.
///   SW2  PUT /v1/stores { storeId: new } → 200 and /me SelectedStoreId == new;
///        switching back to the original store also round-trips.
///   SW3  Owner WITHOUT MultiStores → POST → 403, nothing persisted AND /me
///        StoreList unchanged (a forbidden creation must not leak a selector row).
///   SW4  Deactivating the created store → /me lists it with IsActive=false
///        (the switcher filters on this flag; SetMyStore's accessibility list
///        only contains active stores, so it must never drift from reality).
/// </summary>
[Collection("e2e")]
public sealed class OwnerStoreSwitcherFlowTests
{
    private readonly AppTestFactory _f;
    public OwnerStoreSwitcherFlowTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int MultiStoresModuleId = (int)ModuleType.MultiStores;
    private const int ManagementModuleId = (int)ModuleType.Management;

    private sealed record OwnerFixture(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId);

    /// <summary>
    /// LOCAL seed helper — does NOT modify the shared StoreSeed/AuthzSeed classes
    /// (E2E-untouchable rule). Same shape as OwnerCreateStoreTests.SeedOwnerWithMultiStoresAsync:
    /// user + owner + store (PaymentStartDate = today ⇒ billing AlDia) with StoreModules
    /// {7, 14}, UserRole OwnerAdmin, SelectedStoreId = store. With multistores=false
    /// only the free Management module is seeded.
    /// </summary>
    private static async Task<OwnerFixture> SeedOwnerAsync(AppTestFactory factory, bool multistores)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"swflow-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E SwitcherFlow Owner", "0000000000", login, tenantId);
        db.Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E SwitcherFlow owner");
        db.Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"SWF-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));
        db.Add(store);
        await db.SaveChangesAsync();

        db.Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        if (multistores)
            db.Add(StoreModule.Create(store.Id, MultiStoresModuleId, 5, false, 5, 0, 0, tenantId));
        db.Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new OwnerFixture(user.Id, login, owner.Id, store.Id, tenantId);
    }

    private sealed record StoreCreateBody(
        Guid OwnerId, string Name, string? Address, string? Description, bool Approved, int[] ModuleIds);

    private static StoreCreateBody OwnerBody(string name) => new(
        Guid.Empty, name, "", "", true, Array.Empty<int>());

    private static async Task<MeData> MeAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/auth/me");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    [Fact]
    public async Task SW1_created_store_appears_in_me_store_list_as_active_without_repointing_selection()
    {
        var f = await SeedOwnerAsync(_f, multistores: true);
        var name = $"SWF-Created-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);

            var response = await client.PostAsJsonAsync("/api/v1/stores", OwnerBody(name));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            created = body.Data!.Id;

            var me = await MeAsync(client);
            me.IsOwnerAdmin.Should().BeTrue();
            me.StoreList.Should().ContainSingle(s =>
                s.Id == created && s.Name == name && s.IsActive);
            me.SelectedStoreId.Should().Be(f.StoreId); // creation must not repoint selection
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }

    [Fact]
    public async Task SW2_setmystore_accepts_the_new_store_and_round_trips_back()
    {
        var f = await SeedOwnerAsync(_f, multistores: true);
        var name = $"SWF-Created-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);
            var create = await client.PostAsJsonAsync("/api/v1/stores", OwnerBody(name));
            create.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await create.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            created = body!.Data!.Id;

            // Switch to the new store (what the header switcher does).
            var putNew = await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = created });
            putNew.StatusCode.Should().Be(HttpStatusCode.OK);
            (await MeAsync(client)).SelectedStoreId.Should().Be(created);

            // And back to the original store.
            var putBack = await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = f.StoreId });
            putBack.StatusCode.Should().Be(HttpStatusCode.OK);
            (await MeAsync(client)).SelectedStoreId.Should().Be(f.StoreId);
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }

    [Fact]
    public async Task SW3_owner_without_multistores_gets_403_and_store_list_is_unchanged()
    {
        var f = await SeedOwnerAsync(_f, multistores: false);
        var name = $"SWF-Denied-{Guid.NewGuid():N}";
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);
            var before = await MeAsync(client);
            before.StoreList.Should().ContainSingle(s => s.Id == f.StoreId);

            var response = await client.PostAsJsonAsync("/api/v1/stores", OwnerBody(name));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            // Nothing persisted...
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();

            // ...and /me StoreList unchanged.
            var after = await MeAsync(client);
            after.StoreList.Should().HaveCount(before.StoreList.Count);
            after.StoreList.Should().NotContain(s => s.Name == name);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }

    [Fact]
    public async Task SW4_deactivated_store_is_listed_with_is_active_false()
    {
        var f = await SeedOwnerAsync(_f, multistores: true);
        var name = $"SWF-Created-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);
            var create = await client.PostAsJsonAsync("/api/v1/stores", OwnerBody(name));
            create.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await create.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            created = body!.Data!.Id;
            (await MeAsync(client)).StoreList.Should().ContainSingle(s => s.Id == created && s.IsActive);

            await StoreSeed.DeactivateStoreAsync(_f, created);

            // Still listed (OwnerAdmin sees all their stores) but flagged inactive —
            // the exact shape the header switcher needs to hide/disable it.
            var me = await MeAsync(client);
            me.StoreList.Should().ContainSingle(s => s.Id == created && s.Name == name && !s.IsActive);
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId);
        }
    }
}
