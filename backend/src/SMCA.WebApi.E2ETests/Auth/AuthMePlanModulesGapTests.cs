using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// Gap E2E rows of the module/feature dimension of <c>GET /api/v1/auth/me</c>
/// (plan 2026-09-08-e2e-plan-gated-modules-auth-roster, matrix E1-6 and E1-7):
/// <list type="bullet">
/// <item>E1-6 — a deactivated store user no longer appears in <c>Roles</c>.</item>
/// <item>E1-7 — a SuperAdmin whose selected store holds every AvailableToStore module
/// sees the full module list.</item>
/// </list>
/// New file (convention <c>*GapTests.cs</c>); existing suites and support files are
/// untouched per the repo's E2E-untouchable rule.
/// </summary>
[Collection("e2e")]
public sealed class AuthMePlanModulesGapTests
{
    private readonly AppTestFactory _f;
    public AuthMePlanModulesGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // ── Edge Cases ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Me_inactive_storeuser_not_in_roles()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            // Precondition (AGENTS.md gotcha): while the store-user association is active,
            // /me DOES list the store/module in Roles — otherwise the negative assertion
            // below could not distinguish "deactivated" from "never visible".
            var before = await MeAsync(f.UserId, f.Login);
            before.Data!.Roles.Should().Contain(r => r.StoreId == f.StoreId);

            // Deactivate ONLY the StoreUser membership, leaving the UserRole active, directly
            // in the DB (NoTracking-safe ExecuteUpdateAsync — no production endpoint flips a
            // StoreUser row). This proves the load-bearing filter for /me Roles now consults
            // StoreUser.IsActive: GetStoreRoleFeaturesByUserIdAsync requires an active
            // StoreUser row for StoreUser-role features, so a deactivated store user drops
            // out of Roles even while the UserRole row stays active. OwnerAdmin is unaffected
            // by this gate because it has no StoreUser row.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<StoreUser>().IgnoreQueryFilters()
                    .Where(su => su.UserId == f.UserId)
                    .ExecuteUpdateAsync(s => s.SetProperty(su => su.IsActive, false));
            }

            var after = await MeAsync(f.UserId, f.Login);

            // No active store role feature resolves for the deactivated store user.
            after.Data!.Roles.Should().NotContain(r => r.StoreId == f.StoreId);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.OwnerUserId, f.UserId);
        }
    }

    [Fact]
    public async Task Me_superuser_sees_full_module_list()
    {
        var login = $"sa-full-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var modules = await AvailableModulesAsync();
        var allModuleIds = modules.Select(m => m.Id).ToList();
        allModuleIds.Should().NotBeEmpty();

        var seeded = await SeedStoreWithModulesAsync(modules, DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            // The SuperAdmin's selected store is the one holding every module.
            await SetSelectedStoreAsync(saId, seeded.StoreId);

            var body = await MeAsync(saId, login);

            // Every module the store holds (the full AvailableToStore catalog) is visible.
            body.Data!.StoreModuleIds.Should().BeEquivalentTo(allModuleIds);
        }
        finally
        {
            await CleanupStoreAsync(seeded.StoreId, seeded.OwnerId, seeded.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private async Task<ApiResponse<CurrentUserDto>> MeAsync(Guid userId, string login)
    {
        var response = await DbTestHelpers.AuthedClient(_f, userId, login).GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body;
    }

    /// <summary>AvailableToStore catalog modules exactly as the runtime resolves them.</summary>
    private async Task<List<Module>> AvailableModulesAsync()
    {
        using var scope = _f.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<Domain.Interfaces.Repositories.IModuleRepository>();
        return (await repo.GetAvailableModulesToStore()).ToList();
    }

    /// <summary>
    /// LOCAL seed helper — an active Owner + approved Store (plan Pago) holding the given
    /// modules with their catalog price snapshots. Does not touch the shared support files.
    /// </summary>
    private async Task<(Guid OwnerId, Guid OwnerUserId, Guid StoreId)> SeedStoreWithModulesAsync(
        IReadOnlyList<Module> modules, DateOnly? paymentStartDate)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var ownerLogin = $"sa-full-owner-{Guid.NewGuid():N}@test.com";
        var ownerUser = User.Create(ownerLogin, DbTestHelpers.HashPassword("Password123"), "E2E Full Modules Owner", "0000000000", ownerLogin, tenantId);
        db.Set<User>().Add(ownerUser);
        var owner = Owner.Create(ownerUser.Id, false, tenantId, "E2E Full Modules Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Full-Modules-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            paymentStartDate, storePlanId: (int)StorePlanType.Pago);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        foreach (var module in modules)
        {
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, module.Id, module.Price, module.PriceIncluded,
                module.Price, module.DiscountPrice, module.PercentDiscountPrice, tenantId));
        }
        await db.SaveChangesAsync();

        return (owner.Id, ownerUser.Id, store.Id);
    }

    private async Task SetSelectedStoreAsync(Guid userId, Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.SelectedStoreId, storeId));
    }

    private async Task CleanupStoreAsync(Guid storeId, Guid ownerId, Guid ownerUserId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(x => x.Id == storeId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(x => x.Id == ownerId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(x => x.Id == ownerUserId).ExecuteDeleteAsync();
    }
}
