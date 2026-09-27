using System.Linq.Expressions;
using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.StoreUsages;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

/// <summary>
/// An owner whose store carries <c>StorePayment</c> rows cannot be physically deleted —
/// only deactivated. <c>DELETE /api/v1/Owners/{id}</c> must answer <c>409 Conflict</c> with a
/// readable reason and delete NOTHING AT ALL.
/// <para>
/// Before the guard, the handler queued the whole hard-delete cascade and the database threw
/// the <c>FK_StorePayment_Store_StoreId</c> Restrict violation mid-way, which surfaced as a 500
/// and survived only by accident through EF's transaction rollback. These tests pin the
/// designed behaviour instead: the check runs BEFORE the first delete is queued, so every row
/// the cascade would have removed is still there afterwards.
/// </para>
/// <para>
/// Scope is payments ONLY. The sibling references (a self-reseller link, refresh tokens,
/// inventory entries) keep their current behaviour and stay in
/// <see cref="OwnersDeleteReferencesTests"/>.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnersDeletePaymentsGuardTests
{
    private readonly AppTestFactory _f;
    public OwnersDeletePaymentsGuardTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Delete_owner_with_store_payments_returns_409_and_deletes_nothing()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedOwnerGraphAsync(withPayment: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{seeded.OwnerId}");

            r.StatusCode.Should().Be(HttpStatusCode.Conflict,
                "an owner with payments must be deactivated, not deleted");

            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeFalse();
            b.ActionCode.Should().Be((int)HttpStatusCode.Conflict);
            b.Errors.Should().NotBeEmpty();

            // Readable, specific reason — not the middleware's generic 500 text. The E2E host
            // resolves I18n.en.resx (AppExtensions.cs sets the default request culture to "en"),
            // so the message is asserted in English on purpose.
            var description = b.Errors[0].Description;
            description.Should().NotBeNullOrWhiteSpace();
            description.Should().NotContain("An unexpected error occurred");
            description!.ToLowerInvariant().Should().Contain("payment");
            description.ToLowerInvariant().Should().Contain("deactiv");

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // NOTHING was deleted. The cascade removes every one of these, so each surviving
            // row is direct evidence that no delete was even queued.
            (await CountAsync<Owner>(db, o => o.Id == seeded.OwnerId))
                .Should().Be(1, "the Owner must survive");
            (await CountAsync<User>(db, u => u.Id == seeded.UserId))
                .Should().Be(1, "the User must survive");
            (await CountAsync<Store>(db, s => s.Id == seeded.StoreId))
                .Should().Be(1, "the Store must survive");
            (await CountAsync<UserRole>(db, ur => ur.UserId == seeded.UserId))
                .Should().Be(1, "the UserRole must survive");
            (await CountAsync<StoreUser>(db, su => su.StoreId == seeded.StoreId))
                .Should().Be(1, "the StoreUser must survive");
            (await CountAsync<StoreModule>(db, sm => sm.StoreId == seeded.StoreId))
                .Should().Be(1, "the StoreModule must survive");
            (await CountAsync<StoreUsage>(db, su => su.StoreId == seeded.StoreId))
                .Should().Be(1, "the StoreUsage must survive");
            (await CountAsync<StorePayment>(db, sp => sp.StoreId == seeded.StoreId))
                .Should().Be(1, "the StorePayment must survive");
        }
        finally
        {
            await CleanupGraphAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Delete_owner_without_store_payments_still_succeeds()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedOwnerGraphAsync(withPayment: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{seeded.OwnerId}");

            r.StatusCode.Should().Be(HttpStatusCode.OK,
                "the new guard must not block an owner whose stores have no payments");

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await CountAsync<Owner>(db, o => o.Id == seeded.OwnerId)).Should().Be(0);
            (await CountAsync<User>(db, u => u.Id == seeded.UserId)).Should().Be(0);
            (await CountAsync<Store>(db, s => s.Id == seeded.StoreId)).Should().Be(0);
        }
        finally
        {
            await CleanupGraphAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private sealed record SeededGraph(Guid StoreId, Guid OwnerId, Guid UserId);

    private static async Task<int> CountAsync<T>(ApplicationDbContext db, Expression<Func<T, bool>> predicate)
        where T : class
        => await db.Set<T>().IgnoreQueryFilters().Where(predicate).CountAsync();

    private async Task<SeededGraph> SeedOwnerGraphAsync(bool withPayment)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"payguard-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Payments Guard Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Payments Guard Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"PAYG-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, 7, 0, true, 0, 0, 0, tenantId));
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId));
        db.Set<StoreUsage>().Add(StoreUsage.Create(
            store.Id, user.Id, DateTime.UtcNow, "127.0.0.1", "test", "id", "sid"));
        if (withPayment)
        {
            db.Set<StorePayment>().Add(StorePayment.Create(
                store.Id, (int)StorePaymentStatusType.Paid, 1000f,
                DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.Year, DateTimeOffset.UtcNow.Month,
                tenantId, null, 0f, 0f, 0f, false));
        }
        await db.SaveChangesAsync();

        return new SeededGraph(store.Id, owner.Id, user.Id);
    }

    // FK order matters: every FK in the model is DeleteBehavior.Restrict, so the payment
    // must go before the store it points at, and the store's children before the store.
    private async Task CleanupGraphAsync(SeededGraph seeded)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<StorePayment>().IgnoreQueryFilters()
            .Where(sp => sp.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(srf => srf.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<StoreUsage>().IgnoreQueryFilters()
            .Where(su => su.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => o.Id == seeded.OwnerId).ExecuteDeleteAsync();
        await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(ur => ur.UserId == seeded.UserId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == seeded.UserId).ExecuteDeleteAsync();
    }
}
