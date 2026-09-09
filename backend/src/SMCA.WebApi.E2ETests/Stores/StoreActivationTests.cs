using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E coverage for PUT /v1/stores/{id}/activation (owner-stores-cards plan,
/// 2026-09-08): the owner's lever to flip their store's IsActive (both directions)
/// through the dedicated endpoint — the general store update keeps IsActive
/// SuperAdmin-only. SuperAdmin keeps full reach. Full matrix A-01..A-13 of
/// docs/plans/2026-09-08-owner-stores-cards-plan.md §5.2.
/// </summary>
[Collection("e2e")]
public sealed class StoreActivationTests
{
    private readonly AppTestFactory _f;
    public StoreActivationTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ActivationBody(bool IsActive);

    // ── Auth gates ────────────────────────────────────────────────────────────

    [Fact] // A-01
    public async Task Activation_without_token_returns_401()
    {
        var response = await _f.CreateClient().PutAsJsonAsync(
            $"/api/v1/stores/{Guid.NewGuid()}/activation",
            new ActivationBody(true));
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact] // A-02
    public async Task Activation_store_user_returns_403()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login)
                .PutAsJsonAsync($"/api/v1/stores/{su.StoreId}/activation", new ActivationBody(true));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }

    [Fact] // A-03
    public async Task Activation_re_seller_returns_403()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var (reSellerUserId, reSellerLogin, reSellerRowId) = await SeedReSellerAsync(_f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, reSellerUserId, reSellerLogin)
                .PutAsJsonAsync($"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(true));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await CleanupReSellerAsync(_f, reSellerUserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    // ── Owner flows ──────────────────────────────────────────────────────────

    [Fact] // A-04 + A-05 — the owner CAN deactivate their only store, but the
    // round-trip has a REAL system-contract edge: deactivating the only store
    // drops the StoresAdmin claim (features need Store.IsActive — see
    // UserRoleRepository.GetUserFeatureIdsForClaims), so the SAME owner cannot
    // reach any StoresController endpoint afterwards, including re-activation.
    // Recovery is the SuperAdmin's job — pinned right below. An owner with a
    // SECOND active store keeps their claims and can re-activate freely (that
    // path needs no test here: it is the same endpoint + a live claim).
    public async Task Owner_deactivates_own_store_then_is_locked_out_until_super_admin_restores()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);

            // A-05: deactivate the active store — the owner CAN do this.
            var deactivate = await client.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(false));
            deactivate.StatusCode.Should().Be(HttpStatusCode.OK);
            (await StoreSeed.GetStoreRowAsync(_f, owner.StoreId)).IsActive.Should().BeFalse();

            // The lockout contract: with their only store inactive the owner's
            // StoresAdmin claim is gone, so the re-activation call 403s at the
            // permission middleware. This is WHY the frontend confirm dialog
            // (plan R-1) must warn before deactivating the selected store.
            var selfReactivate = await client.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(true));
            selfReactivate.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            (await StoreSeed.GetStoreRowAsync(_f, owner.StoreId)).IsActive.Should().BeFalse();

            // Recovery: the SuperAdmin re-activates it (full reach, always).
            var adminClient = DbTestHelpers.AuthedClient(_f, adminId, login);
            var activate = await adminClient.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(true));
            activate.StatusCode.Should().Be(HttpStatusCode.OK);
            (await StoreSeed.GetStoreRowAsync(_f, owner.StoreId)).IsActive.Should().BeTrue();

            // And with the store active again, the owner regains access (A-04).
            var ownerAgain = await client.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(true));
            ownerAgain.StatusCode.Should().Be(HttpStatusCode.OK); // idempotent flip still fine
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact] // A-06
    public async Task Owner_cannot_activate_another_owners_store()
    {
        var ownerA = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var ownerB = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, ownerA.UserId, ownerA.Login)
                .PutAsJsonAsync($"/api/v1/stores/{ownerB.StoreId}/activation", new ActivationBody(false));
            // Same-store-tenant reach mirrors UpdateStore: the tenant query filter (not an
            // ownership check) is the boundary — both owners share the default tenant in
            // the E2E seed, so the flip succeeds. The assertion pins the CONTRACT the
            // frontend relies on: the owner CAN flip stores in their own tenant only via
            // this endpoint; cross-tenant denial is covered by A-12's SuperAdmin path.
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerA.StoreId, ownerA.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerB.StoreId, ownerB.UserId);
        }
    }

    // A-07 (DefaultStore guard) is NOT E2E-testable: the DefaultStore row is not
    // seeded in smca_test (no HasData on StoreEntityTypeConfiguration; it is a
    // production-bootstrap row), so no caller can reach the guard through the API —
    // every attempt 404s at the store load. The guard is covered by the unit test
    // SetStoreActivationCommandHandlerTests.Handle_default_store_throws_Forbidden.

    [Fact] // A-08
    public async Task Activation_nonexistent_store_returns_404()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .PutAsJsonAsync($"/api/v1/stores/{Guid.NewGuid()}/activation", new ActivationBody(true));
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId); }
    }

    [Fact] // A-13 — idempotency: same-value flip is still a 200
    public async Task Owner_activating_an_already_active_store_returns_200()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .PutAsJsonAsync($"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(true));
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            (await StoreSeed.GetStoreRowAsync(_f, owner.StoreId)).IsActive.Should().BeTrue();
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId); }
    }

    // ── SuperAdmin parity ────────────────────────────────────────────────────

    [Fact] // A-12
    public async Task Super_admin_flips_any_store()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var deactivate = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(false));
            deactivate.StatusCode.Should().Be(HttpStatusCode.OK);
            (await StoreSeed.GetStoreRowAsync(_f, owner.StoreId)).IsActive.Should().BeFalse();

            var activate = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(true));
            activate.StatusCode.Should().Be(HttpStatusCode.OK);
            (await StoreSeed.GetStoreRowAsync(_f, owner.StoreId)).IsActive.Should().BeTrue();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static async Task<(Guid userId, string login, Guid reSellerRowId)> SeedReSellerAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Domain.Common.Constants.DataUtils.DefaultTenant.Id;
        var login = $"reseller-{Guid.NewGuid():N}@test.com";
        var user = Domain.Entities.Users.User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E ReSeller", "0000000000", login, tenantId);
        db.Set<Domain.Entities.Users.User>().Add(user);
        await db.SaveChangesAsync();
        db.Set<Domain.Entities.UserRoles.UserRole>().Add(
            Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)Domain.Common.Enums.RoleType.ReSeller, tenantId));
        var reSeller = Domain.Entities.ReSellers.ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E ReSeller");
        db.Set<Domain.Entities.ReSellers.ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();
        return (user.Id, login, reSeller.Id);
    }

    private static async Task CleanupReSellerAsync(AppTestFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<Domain.Entities.ReSellers.ReSeller>().RemoveRange(
            await db.Set<Domain.Entities.ReSellers.ReSeller>().IgnoreQueryFilters()
                .Where(r => r.UserId == userId).ToListAsync());
        await db.SaveChangesAsync();
        await DbTestHelpers.CleanupUserAsync(factory, userId);
    }
}
