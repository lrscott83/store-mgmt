using Domain.Common.Constants;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Migrations;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class BackfillMigrationTests
{
    private readonly AppTestFactory _f;

    public BackfillMigrationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Backfill_clears_sentinel_PaymentStartDate_to_null()
    {
        Guid storeId = default;
        Guid ownerId = default;
        Guid userId = default;

        try
        {
            // Arrange: seed a user, owner, and store with PaymentStartDate = DateOnly.MinValue (the sentinel)
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var tenantId = DataUtils.DefaultTenant.Id;

            var login = $"backfill-{Guid.NewGuid():N}@test.com";
            var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
                "E2E Backfill", "0000000000", login, tenantId);
            db.Set<User>().Add(user);

            var owner = Owner.Create(user.Id, false, tenantId, "E2E Backfill Owner");
            db.Set<Owner>().Add(owner);
            await db.SaveChangesAsync();

            var store = Store.Create($"BackfillStore-{Guid.NewGuid():N}", owner.Id, true,
                tenantId, DateOnly.MinValue);
            db.Set<Store>().Add(store);
            await db.SaveChangesAsync();

            storeId = store.Id;
            ownerId = owner.Id;
            userId = user.Id;

            // Act: execute the backfill SQL
            await db.Database.ExecuteSqlRawAsync(PaymentStartDateBackfill.Sql);

            // Assert: the stored store's PaymentStartDate is now null
            // Use AsNoTracking to avoid cached tracked entity returning stale values
            var stored = await db.Set<Store>().IgnoreQueryFilters()
                .AsNoTracking()
                .FirstAsync(s => s.Id == storeId);
            stored.PaymentStartDate.Should().BeNull();
        }
        finally
        {
            // Clean up: store → owner → user
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            if (storeId != default)
            {
                db.Set<Store>().RemoveRange(
                    await db.Set<Store>().IgnoreQueryFilters()
                        .Where(x => x.Id == storeId).ToListAsync());
            }
            if (ownerId != default)
            {
                db.Set<Owner>().RemoveRange(
                    await db.Set<Owner>().IgnoreQueryFilters()
                        .Where(x => x.Id == ownerId).ToListAsync());
            }
            if (userId != default)
            {
                db.Set<User>().RemoveRange(
                    await db.Set<User>().IgnoreQueryFilters()
                        .Where(x => x.Id == userId).ToListAsync());
            }
            await db.SaveChangesAsync();
        }
    }
}