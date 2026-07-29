using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class ResellerCommissionsTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public ResellerCommissionsTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    private sealed record ResellerWithPayments(
        Guid UserId, string Login, Guid ReSellerId, Guid StoreId, Guid OwnerId, Guid TenantId);

    private async Task<ResellerWithPayments> SeedResellerWithPaymentsAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Domain.Common.Constants.DataUtils.DefaultTenant.Id;
        var login = $"reseller-rc-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Comm RC", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E Comm RC");
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Comm RC Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        db.Set<ReSellerOwner>().Add(ReSellerOwner.Create(reSeller.Id, owner.Id, 0, 25, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"RC-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            new DateOnly(2026, 1, 1));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Add two payments for different months
        var mayPayment = StorePayment.Create(
            store.Id, (int)StorePaymentStatusType.Paid, 2000f,
            new DateTimeOffset(2026, 5, 15, 0, 0, 0, TimeSpan.Zero),
            2026, 5, tenantId,
            reSeller.Id, 25f, 0f, 500f, true);
        db.Set<StorePayment>().Add(mayPayment);

        var junePayment = StorePayment.Create(
            store.Id, (int)StorePaymentStatusType.Paid, 1000f,
            new DateTimeOffset(2026, 6, 15, 0, 0, 0, TimeSpan.Zero),
            2026, 6, tenantId,
            reSeller.Id, 20f, 0f, 200f, true);
        db.Set<StorePayment>().Add(junePayment);

        await db.SaveChangesAsync();
        return new ResellerWithPayments(user.Id, login, reSeller.Id, store.Id, owner.Id, tenantId);
    }

    private async Task CleanupAsync(ResellerWithPayments f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        db.Set<StorePayment>().RemoveRange(
            db.Set<StorePayment>().Where(sp => sp.StoreId == f.StoreId));
        db.Set<Store>().RemoveRange(
            db.Set<Store>().Where(s => s.Id == f.StoreId));
        db.Set<ReSellerOwner>().RemoveRange(
            db.Set<ReSellerOwner>().Where(rso => rso.OwnerId == f.OwnerId));
        db.Set<Owner>().RemoveRange(
            db.Set<Owner>().Where(o => o.Id == f.OwnerId));
        db.Set<ReSeller>().RemoveRange(
            db.Set<ReSeller>().Where(r => r.Id == f.ReSellerId));
        db.Set<UserRole>().RemoveRange(
            db.Set<UserRole>().Where(ur => ur.UserId == f.UserId));
        db.Set<User>().RemoveRange(
            db.Set<User>().Where(u => u.Id == f.UserId));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task SuperAdmin_sees_all_commissions()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fixture = await SeedResellerWithPaymentsAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.GetAsync("/api/v1/stores/reseller-commissions");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<
                ApiResponse<List<CommissionDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.Should().HaveCountGreaterOrEqualTo(2);
        }
        finally
        {
            await CleanupAsync(fixture);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    private sealed record CommissionDto
    {
        public int Year { get; set; }
        public int Month { get; set; }
        public int PaymentCount { get; set; }
        public float TotalCommission { get; set; }
    }

    [Fact]
    public async Task Unauthenticated_returns_401()
    {
        var response = await _f.CreateClient()
            .GetAsync("/api/v1/stores/reseller-commissions");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task NonSuperAdminNonReSeller_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login);
            var response = await client.GetAsync("/api/v1/stores/reseller-commissions");

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }
}
