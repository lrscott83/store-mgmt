using System.Net;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

/// <summary>
/// Roster expiry contract (roster-expiry-by-billing-plan):
/// the offline roster bundle's <c>ExpiresAt</c> — and therefore every per-user
/// offline auth JWT minted at export time — depends on the store's billing plan:
///   • Paid plan: expires 5 days after the next payment due date
///     (<c>NextDueDate + 5</c>), giving a small offline buffer past the due date.
///   • Free plan (or paid with no known next due date): falls back to the
///     configured <c>OfflineRosterTtlDays</c> (default 35).
///
/// A snapshot test pins the clock and reads <c>PaymentDueDate</c> straight from the
/// roster export (which the handler mirrors from <c>billing.NextDueDate</c>), so the
/// oracle is the same value the API computed — not a re-derivation of the due-date
/// math.
/// </summary>
[Collection("e2e")]
public sealed class RosterExpiryTests
{
    // Handle-times of the installed SystemConfiguration (default, never re-pinned)
    // for a Free / NoAplica store.
    private const long MsPerDay = 24L * 60 * 60 * 1000;

    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;
    public RosterExpiryTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    /// <summary>
    /// Paid store (Paid plan with a known next due date): the bundle expires 5 days
    /// after the next payment due date, and each offline auth JWT's own expiration
    /// (<c>ValidTo</c>) equals the bundle ExpiresAt.
    /// </summary>
    [Fact]
    public async Task PaidStore_roster_and_JWT_expire_five_days_after_next_due_date()
    {
        // Pin a stable "today" so the billing due-date derivation is deterministic.
        var anchor = new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero);
        using var clock = _fixture.Clock.Pin(anchor);
        await using var cfg = await BillingConfigSeed.PinAsync(_f);

        // SeedPaidStoreAsync sets PaymentStartDate = 2026-05-18 and adds a paid module,
        // so PlanType resolves to "Paid" and NextDueDate is non-null (PaymentStartDate +
        // trialMonths+1). No payment row is required for NextDueDate to exist.
        var seeded = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 5, 18));
        try
        {
            await SetSelectedStoreAsync(seeded.UserId, seeded.StoreId);
            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{seeded.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var roster = body.Data!;

            roster.Users.Should().NotBeEmpty();

            // Precondition: the paid branch is active, i.e. PaymentDueDate is non-null.
            var paidUser = roster.Users.First(u => u.PaymentDueDate.HasValue);
            var dueDate = paidUser.PaymentDueDate!.Value;

            // Bundle expiry == NextDueDate + 5 days (day-granular).
            var expectedExpire = new DateTimeOffset(
                dueDate.AddDays(5).ToDateTime(TimeOnly.MinValue),
                TimeSpan.Zero).UtcDateTime;
            var actualExpire = DateTimeOffset.FromUnixTimeMilliseconds(roster.ExpiresAt).UtcDateTime;
            actualExpire.Should().Be(expectedExpire);

            // The offline auth JWT must expire at exactly the same instant as the bundle.
            foreach (var user in roster.Users)
            {
                user.OfflineAuthToken.Should().NotBeNullOrEmpty();
                var jwt = new JwtSecurityTokenHandler().ReadJwtToken(user.OfflineAuthToken);
                jwt.ValidTo.ToUniversalTime().Should().BeCloseTo(actualExpire, TimeSpan.FromSeconds(5));
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, seeded);
        }
    }

    /// <summary>
    /// Free plan store (no paid module): falls back to the configured TTL (default 35
    /// days), and the bundle + JWT share the same 35-day horizon.
    /// </summary>
    [Fact]
    public async Task FreeStore_roster_and_JWT_expire_default_35_days()
    {
        var anchor = new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero);
        using var clock = _fixture.Clock.Pin(anchor);
        await using var cfg = await BillingConfigSeed.PinAsync(_f);

        var seeded = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            await SetSelectedStoreAsync(seeded.UserId, seeded.StoreId);
            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{seeded.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var roster = body.Data!;

            (roster.ExpiresAt - roster.IssuedAt).Should().Be(35 * MsPerDay);

            var bundleExpire = DateTimeOffset.FromUnixTimeMilliseconds(roster.ExpiresAt).UtcDateTime;
            roster.Users.Should().NotBeEmpty();
            foreach (var user in roster.Users)
            {
                user.OfflineAuthToken.Should().NotBeNullOrEmpty();
                var jwt = new JwtSecurityTokenHandler().ReadJwtToken(user.OfflineAuthToken);
                jwt.ValidTo.ToUniversalTime().Should().BeCloseTo(bundleExpire, TimeSpan.FromSeconds(5));
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, seeded);
        }
    }

    private async Task SetSelectedStoreAsync(Guid userId, Guid storeId)
    {
        // The offline-roster endpoint is scoped to the caller's selected store; the
        // BillingSeed helpers leave SelectedStoreId null, so point it at the seeded store.
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = await db.Set<User>().IgnoreQueryFilters()
            .SingleAsync(u => u.Id == userId);
        user.SelectedStoreId = storeId;
        db.Entry(user).State = EntityState.Modified;
        await db.SaveChangesAsync();
    }
}
