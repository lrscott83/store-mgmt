using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.Tenants;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class GetStoresToCollectTests
{
    private readonly AppTestFactory _f;
    public GetStoresToCollectTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record StoreWithOwner(Guid StoreId, Guid OwnerId, Guid OwnerUserId, string StoreName);

    /// <summary>
    /// Seed a store with PaymentStartDate set and a free module.
    /// </summary>
    private async Task<StoreWithOwner> SeedStoreAsync(string storeName)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"owner-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        // Set PaymentStartDate so that nextDue ≈ today+3d → PorVencer (within due-soon window)
        var paymentStart = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-2).AddDays(3);
        var store = Store.Create(storeName, owner.Id, true, tenantId,
            paymentStart);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Add a paid module (PriceIncluded = false)
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, 2, 2000, false, 2000, 0, 25, tenantId));
        await db.SaveChangesAsync();

        return new StoreWithOwner(store.Id, owner.Id, user.Id, storeName);
    }

    /// <summary>
    /// Seed a store with a PaymentBeforeDate far in the future (makes it AlDia).
    /// </summary>
    private async Task<StoreWithOwner> SeedStoreWithFuturePaymentAsync(string storeName)
    {
        var fixture = await SeedStoreAsync(storeName);

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Insert a payment with a due date far in the future
        var farFuture = new DateTimeOffset(2028, 6, 15, 0, 0, 0, TimeSpan.Zero);
        var payment = Domain.Entities.StorePayments.StorePayment.Create(
            storeId: fixture.StoreId,
            storePaymentStatusId: 5, // Paid
            price: 2000f,
            paymentBeforeDate: farFuture,
            year: 2028, month: 6, tenantId: DataUtils.DefaultTenant.Id,
            reSellerId: null, reSellerPercentDiscountPrice: 0, reSellerDiscountPrice: 0,
            reSellerAmount: 0, byReSeller: false);
        db.Set<Domain.Entities.StorePayments.StorePayment>().Add(payment);
        await db.SaveChangesAsync();

        return fixture;
    }

    private async Task CleanupStoreAsync(StoreWithOwner f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var payments = db.Set<Domain.Entities.StorePayments.StorePayment>()
            .Where(p => p.StoreId == f.StoreId);
        db.Set<Domain.Entities.StorePayments.StorePayment>().RemoveRange(payments);

        var modules = db.Set<StoreModule>().Where(sm => sm.StoreId == f.StoreId);
        db.Set<StoreModule>().RemoveRange(modules);

        var stores = db.Set<Store>().Where(s => s.Id == f.StoreId);
        db.Set<Store>().RemoveRange(stores);

        db.Set<Owner>().RemoveRange(db.Set<Owner>().Where(o => o.Id == f.OwnerId));

        var users = db.Set<User>().Where(u => u.Id == f.OwnerUserId);
        db.Set<User>().RemoveRange(users);

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task SuperAdmin_gets_to_collect_returns_200()
    {
        // Arrange
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await SeedStoreAsync($"Collect-Store-{Guid.NewGuid():N}");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            // Act
            var response = await client.GetAsync("/api/v1/stores/to-collect");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();

            // The seeded store should be in the results (it was just activated)
            var storeInResult = body.Data!.FirstOrDefault(s => s.StoreId == store.StoreId);
            storeInResult.Should().NotBeNull();
            storeInResult!.StoreName.Should().Be(store.StoreName);
            storeInResult.Amount.Should().BeGreaterThan(0);
            storeInResult.NextDueDate.Should().NotBeNull();
            storeInResult.Status.Should().NotBeNullOrEmpty();
        }
        finally
        {
            await CleanupStoreAsync(store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task SuperAdmin_results_ordered_by_due_date()
    {
        // Arrange
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");

        // Store 1: freshly activated (earlier due)
        var store1 = await SeedStoreAsync($"Store-A-{Guid.NewGuid():N}");

        // Store 2: with a future payment (later due, might be AlDia → filtered out)
        var store2 = await SeedStoreWithFuturePaymentAsync($"Store-B-{Guid.NewGuid():N}");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            // Act
            var response = await client.GetAsync("/api/v1/stores/to-collect");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Results should be ordered by NextDueDate ascending
            var data = body.Data!;
            if (data.Count > 1)
            {
                for (int i = 1; i < data.Count; i++)
                {
                    var prev = data[i - 1].NextDueDate;
                    var curr = data[i].NextDueDate;
                    if (prev.HasValue && curr.HasValue)
                        prev.Value.Should().BeOnOrBefore(curr.Value);
                }
            }
        }
        finally
        {
            await CleanupStoreAsync(store2);
            await CleanupStoreAsync(store1);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Unauthenticated_request_returns_401()
    {
        // Act
        var response = await _f.CreateClient().GetAsync("/api/v1/stores/to-collect");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}

/// <summary>
/// DTO matching StoreToCollectDto for deserialization.
/// </summary>
public sealed class StoreToCollectData
{
    public Guid StoreId { get; set; }
    public string StoreName { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public float Amount { get; set; }
    public DateOnly? NextDueDate { get; set; }
    public string Status { get; set; } = string.Empty;
}