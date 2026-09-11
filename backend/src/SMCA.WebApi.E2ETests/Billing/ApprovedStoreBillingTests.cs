using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

// Product decision 2026-09-10: a store with Approved == false must never pay and never expire —
// behavior identical to the PaymentStartDate == null branch (NoAplica, Free, no due dates). These
// tests pin that end-to-end: /me shows the null-clock summary, the store is absent from to-collect,
// and payment registration is rejected. The disapproved stores are seeded with a NON-null
// PaymentStartDate, so each assertion can only hold because of the Approved guard, not the legacy
// null-start-date branch.
[Collection("e2e")]
public sealed class ApprovedStoreBillingTests
{
    private readonly AppTestFactory _f;
    public ApprovedStoreBillingTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int FreeModuleId = 7;
    private const int PaidModuleId = 6;

    private sealed record DisapprovedFixture(Guid UserId, string Login, Guid OwnerId, Guid StoreId);

    /// <summary>
    /// Creates user + OwnerAdmin role + Owner + store with Approved=false and the given
    /// PaymentStartDate, plus a free module (Management) and optionally a paid module (Statistics).
    /// </summary>
    private static async Task<DisapprovedFixture> SeedDisapprovedStoreAsync(
        AppTestFactory factory,
        DateOnly? paymentStartDate,
        bool addPaidModule)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"disapproved-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Disapproved", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Disapproved Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Dis-Store-{Guid.NewGuid():N}", owner.Id, approved: false, tenantId, paymentStartDate);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Free module (Management, PriceIncluded=true)
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));
        // Paid module (Statistics, PriceIncluded=false) — makes billing WOULD-be active if approved
        if (addPaidModule)
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, PaidModuleId, price: 2000, modulePriceIncluded: false,
                modulePrice: 2000, moduleDiscountPrice: 0, modulePercentDiscountPrice: 75, tenantId));

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();

        return new DisapprovedFixture(user.Id, login, owner.Id, store.Id);
    }

    private async Task CleanupDisapprovedAsync(DisapprovedFixture f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        db.Set<StorePayment>().RemoveRange(
            await db.Set<StorePayment>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(
            await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<Store>().RemoveRange(
            await db.Set<Store>().IgnoreQueryFilters().Where(x => x.Id == f.StoreId).ToListAsync());
        db.Set<Owner>().RemoveRange(
            await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.Id == f.OwnerId).ToListAsync());
        db.Set<UserRole>().RemoveRange(
            await db.Set<UserRole>().IgnoreQueryFilters().Where(x => x.UserId == f.UserId).ToListAsync());
        db.Set<User>().RemoveRange(
            await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == f.UserId).ToListAsync());
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task DisapprovedStore_me_returns_NoAplica_free_noDueDate_keepsAllModules()
    {
        // PaymentStartDate = today: WITHOUT the Approved guard this store would be an active paid
        // trial (AlDia, IsInTrial=true, a due date, PlanType Paid). Only approved=false makes it NoAplica.
        var f = await SeedDisapprovedStoreAsync(_f, DateOnly.FromDateTime(DateTime.UtcNow), addPaidModule: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .GetAsync("/api/v1/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            body.Data!.PaymentStatus.Should().Be("NoAplica");
            body.Data.PlanType.Should().Be("Free");
            body.Data.IsInTrial.Should().BeFalse();
            body.Data.PaymentDueDate.Should().BeNull();
            // NoAplica ⇒ no billing filter: free AND paid modules stay accessible.
            body.Data.StoreModuleIds.Should().Contain(FreeModuleId);
            body.Data.StoreModuleIds.Should().Contain(PaidModuleId);
        }
        finally
        {
            await CleanupDisapprovedAsync(f);
        }
    }

    [Fact]
    public async Task DisapprovedStore_absent_from_to_collect()
    {
        // Mirrors GetStoresToCollectTests.SuperAdmin_gets_to_collect seeding (approved:true there →
        // nextDue ≈ today+3d, PorVencer, returned). Here only approved=false differs, so the absence
        // can only be explained by the Approved filter on GetPaidStoresAsync.
        var f = await SeedDisapprovedStoreAsync(_f,
            DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-2).AddDays(3), addPaidModule: true);
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync("/api/v1/stores/to-collect");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Should().NotContain(s => s.StoreId == f.StoreId);
        }
        finally
        {
            await CleanupDisapprovedAsync(f);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task DisapprovedStore_payment_registration_rejected()
    {
        // PaymentStartDate is NON-null here, so the rejection must come from the Approved guard
        // (product decision 2026-09-10), not the legacy null-start-date guard.
        var f = await SeedDisapprovedStoreAsync(_f, DateOnly.FromDateTime(DateTime.UtcNow), addPaidModule: true);
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsync($"/api/v1/stores/{f.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<StorePayment>().IgnoreQueryFilters().AnyAsync(p => p.StoreId == f.StoreId))
                .Should().BeFalse();
        }
        finally
        {
            await CleanupDisapprovedAsync(f);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}