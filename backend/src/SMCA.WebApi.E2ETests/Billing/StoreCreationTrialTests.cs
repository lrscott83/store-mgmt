using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Application.Dtos.StoreManagement;
using Domain.Common.Constants;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

/// <summary>
/// Pins that every created store (admin POST /v1/stores and self-registration) starts its
/// trial clock unconditionally — see specs/billing/spec.md and specs/billing-e2e-coverage/spec.md.
///
/// TWO-PIN TRAP (read before adding a test): MutableDateTimeProvider.Pin's Dispose resets to the
/// WALL CLOCK, not to an outer pin. A test that needs a different "today" at creation vs.
/// assertion time must declare two flat `using var` pins in the same method scope:
///
///     // CORRECT — re-pin by calling Pin again; both scopes dispose at method exit.
///     using var atCreation = _fixture.Clock.Pin(AnchorInstant);
///     var store = await RegisterStoreAsync();
///     using var atAssertion = _fixture.Clock.Pin(AnchorInstant.AddMonths(2).AddDays(6));
///     var me = await MeAsync(client);
///
///     // WRONG — the inner block's Dispose unpins to WALL CLOCK, not back to AnchorInstant.
///     // using (var atAssertion = _fixture.Clock.Pin(...)) { ... }
///
/// Never nest a Pin inside a `using (...) { }` block.
/// </summary>
[Collection("e2e")]
public sealed class StoreCreationTrialTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    // Chosen so no AddMonths lands on a short month: day-of-month = 10 everywhere (design D7).
    private static readonly DateTimeOffset AnchorInstant = new(2026, 3, 10, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Start = new(2026, 3, 10);

    // Test 5 exception (design D6/D7): a near-wall-clock anchor, not the far-future AnchorInstant.
    // AuthzSeed.SeedOwnerAdminAsync seeds the actor's own store with the real wall clock, and a
    // far-future pin would push that store toward Vencido.
    private static readonly DateTimeOffset AnchorCloseInstant = DateTimeOffset.UtcNow.Date;

    public StoreCreationTrialTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    private static DateTimeOffset AtUtc(DateOnly date) => new(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

    private sealed record CreatedStore(Guid AdminId, string AdminLogin, Guid OwnerId, Guid OwnerUserId, string OwnerLogin, Guid StoreId);
    private sealed record RegisteredStore(string Login, string Token, Guid UserId, Guid TenantId, Guid StoreId);

    /// <summary>
    /// Local owner seed — deliberately NOT StoreSeed.SeedOwnerAsync/OwnerFixture: that fixture
    /// does not return the owner's login, and tests 14/16 need to authenticate as the owner
    /// (whose SelectedStoreId is set directly) against /auth/me.
    /// </summary>
    private async Task<(Guid OwnerId, Guid UserId, string Login)> SeedOwnerAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"trial-owner-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Trial Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Trial Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        return (owner.Id, user.Id, login);
    }

    /// <summary>
    /// Seeds a SuperAdmin + owner, then creates a store via the real admin endpoint
    /// (POST /api/v1/stores), asserting 201 Created. Pass strayPaymentStartDate to reproduce
    /// test 4's stray client-supplied field.
    /// </summary>
    private async Task<CreatedStore> CreateStoreViaApiAsync(IEnumerable<int> moduleIds, string? strayPaymentStartDate = null)
    {
        var adminLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var (ownerId, ownerUserId, ownerLogin) = await SeedOwnerAsync();

        var name = $"Trial-Admin-Store-{Guid.NewGuid():N}";
        object body = strayPaymentStartDate is null
            ? new
            {
                OwnerId = ownerId,
                Name = name,
                Address = (string?)null,
                Description = (string?)null,
                Approved = true,
                ModuleIds = moduleIds.ToList(),
            }
            : new
            {
                OwnerId = ownerId,
                Name = name,
                Address = (string?)null,
                Description = (string?)null,
                Approved = true,
                ModuleIds = moduleIds.ToList(),
                PaymentStartDate = strayPaymentStartDate,
            };

        var response = await DbTestHelpers.AuthedClient(_f, adminId, adminLogin).PostAsJsonAsync("/api/v1/stores", body);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<ApiResponse<StoreDto>>(ApiResponse.Json);
        created!.Succeeded.Should().BeTrue();

        return new CreatedStore(adminId, adminLogin, ownerId, ownerUserId, ownerLogin, created.Data!.Id);
    }

    private async Task CleanupCreatedStoreAsync(CreatedStore created)
    {
        await StoreSeed.CleanupStoreAsync(_f, created.StoreId);
        // Removes Owner + UserRole + User for both the owner and (no-op for the ownerless) admin.
        await DbTestHelpers.CleanupUserAsync(_f, created.OwnerUserId);
        await DbTestHelpers.CleanupUserAsync(_f, created.AdminId);
    }

    /// <summary>
    /// The real self-registration path (POST /api/v1/auth/register). RegisterCommand assigns
    /// ALL available modules — use CreateStoreViaApiAsync instead whenever a test needs a small,
    /// known module set.
    /// </summary>
    private async Task<RegisteredStore> RegisterStoreAsync()
    {
        var login = $"trial-reg-{Guid.NewGuid():N}@test.com";
        var storeName = $"Trial-Register-Store-{Guid.NewGuid():N}";

        var response = await _f.CreateClient().PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = "E2E Trial Register",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = storeName,
            Code = (string?)null,
        });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();

        var user = await DbTestHelpers.GetUserByLoginAsync(_f, login);
        user.Should().NotBeNull();

        Guid storeId;
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(s => s.TenantId == user!.TenantId);
            storeId = store.Id;
        }

        return new RegisteredStore(login, body.Data!.AuthToken, user!.Id, user.TenantId, storeId);
    }

    /// <summary>
    /// Reads the persisted row directly — the subject of this change is what is persisted,
    /// and StoreDto is a separate contract. AsNoTracking is required: BackfillMigrationTests.cs
    /// documents the stale-tracked-entity bite.
    /// </summary>
    private async Task<DateOnly?> ReadPaymentStartDateAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = await db.Set<Store>().IgnoreQueryFilters().AsNoTracking().FirstAsync(s => s.Id == storeId);
        return store.PaymentStartDate;
    }

    private async Task SetSelectedStoreIdAsync(Guid userId, Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = await db.Set<User>().IgnoreQueryFilters().FirstAsync(u => u.Id == userId);
        user.SelectedStoreId = storeId;
        await db.SaveChangesAsync();
    }

    private static async Task<ApiResponse<CurrentUserDto>> MeAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body;
    }

    // ---------------------------------------------------------------------
    // A. Admin POST /v1/stores (tests 1-5)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Create_sets_paymentStartDate_to_today()
    {
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var created = await CreateStoreViaApiAsync(new[] { StoreSeed.ManagementModuleId });
        try
        {
            (await ReadPaymentStartDateAsync(created.StoreId)).Should().Be(Start);
        }
        finally
        {
            await CleanupCreatedStoreAsync(created);
        }
    }

    [Fact]
    public async Task Create_with_paid_module_sets_paymentStartDate_to_today()
    {
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var created = await CreateStoreViaApiAsync(new[] { StoreSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
        try
        {
            (await ReadPaymentStartDateAsync(created.StoreId)).Should().Be(Start);
        }
        finally
        {
            await CleanupCreatedStoreAsync(created);
        }
    }

    [Fact]
    public async Task Create_with_free_only_modules_also_sets_paymentStartDate()
    {
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        // Free-only (PriceIncluded) modules — the discriminator vs. the UpdateStore-only conditional:
        // creation must be unconditional, not gated on a paid module being present.
        var created = await CreateStoreViaApiAsync(new[] { StoreSeed.ManagementModuleId });
        try
        {
            (await ReadPaymentStartDateAsync(created.StoreId)).Should().Be(Start);
        }
        finally
        {
            await CleanupCreatedStoreAsync(created);
        }
    }

    [Fact]
    public async Task Create_ignores_client_supplied_paymentStartDate()
    {
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var created = await CreateStoreViaApiAsync(new[] { StoreSeed.ManagementModuleId }, strayPaymentStartDate: "2020-01-01");
        try
        {
            var persisted = await ReadPaymentStartDateAsync(created.StoreId);
            persisted.Should().Be(Start);
            persisted.Should().NotBe(new DateOnly(2020, 1, 1));
        }
        finally
        {
            await CleanupCreatedStoreAsync(created);
        }
    }

    [Fact]
    public async Task Update_by_non_superadmin_cannot_seed_paymentStartDate()
    {
        using var clock = _fixture.Clock.Pin(AnchorCloseInstant);

        var moduleIds = new[] { StoreSeed.ManagementModuleId, BillingSeed.StatisticsModuleId };
        var created = await CreateStoreViaApiAsync(moduleIds);
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var originalStartDate = await ReadPaymentStartDateAsync(created.StoreId);

            // Same module list used at creation, so UpdateStoreCommandHandler's
            // PaymentStartDate is null && hasPaidModuleRequested branch is skipped — it's not
            // null already. This isolates the SuperAdmin-only PaymentStartDate gate.
            var response = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/stores/{created.StoreId}", new
                {
                    Id = created.StoreId,
                    Name = $"Renamed-{Guid.NewGuid():N}",
                    Address = (string?)null,
                    Description = (string?)null,
                    Approved = true,
                    ModuleIds = moduleIds,
                    IsActive = true,
                    PaymentStartDate = "2020-01-01",
                });

            // Assert 200 first so an auth regression is distinguishable from a guard regression.
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var persisted = await ReadPaymentStartDateAsync(created.StoreId);
            persisted.Should().Be(originalStartDate);
            persisted.Should().NotBe(new DateOnly(2020, 1, 1));
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
            await CleanupCreatedStoreAsync(created);
        }
    }

    // ---------------------------------------------------------------------
    // B. Self-registration (tests 6-7)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Register_creates_store_with_paymentStartDate_today()
    {
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var registered = await RegisterStoreAsync();
        try
        {
            (await ReadPaymentStartDateAsync(registered.StoreId)).Should().Be(Start);
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task Register_store_reports_trial_in_billing_summary()
    {
        // Config pin required — this test reads SystemConfiguration-derived fields.
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var registered = await RegisterStoreAsync();
        try
        {
            var me = await MeAsync(AuthTestHelpers.BearerClient(_f, registered.Token));
            me.Data!.IsInTrial.Should().BeTrue();
            // Module 6 "Estadísticas" passes GetAvailableModulesToStore's filter, so a
            // self-registered store always receives at least one paid module.
            me.Data.PlanType.Should().Be("Paid");
            me.Data.PaymentStatus.Should().Be("AlDia");
            me.Data.PaymentDueDate.Should().Be(Start.AddMonths(2));
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    // ---------------------------------------------------------------------
    // C. Derived math + module filter under Vencido (tests 8-14)
    //
    // Baseline landmarks (all under BillingConfigSeed.PinAsync() defaults: trialMonths=1,
    // graceDays=5, dueSoonDays=5, Start = 2026-03-10):
    //   due = Start.AddMonths(2) = 2026-05-10
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Day_one_is_in_trial_and_AlDia()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var registered = await RegisterStoreAsync();
        try
        {
            var me = await MeAsync(AuthTestHelpers.BearerClient(_f, registered.Token));
            me.Data!.IsInTrial.Should().BeTrue();
            me.Data.PaymentStatus.Should().Be("AlDia");
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task Trial_ends_one_month_after_creation()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var atCreation = _fixture.Clock.Pin(AnchorInstant);
        var registered = await RegisterStoreAsync();
        try
        {
            // Two-pin idiom (see header): flat, not nested — atCreation stays in scope.
            using var atAssertion = _fixture.Clock.Pin(AnchorInstant.AddMonths(1).AddDays(1));
            var me = await MeAsync(AuthTestHelpers.BearerClient(_f, registered.Token));
            me.Data!.IsInTrial.Should().BeFalse();
            me.Data.PaymentStatus.Should().Be("AlDia");
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task First_due_is_creation_plus_two_months()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var registered = await RegisterStoreAsync();
        try
        {
            var me = await MeAsync(AuthTestHelpers.BearerClient(_f, registered.Token));
            me.Data!.PaymentDueDate.Should().Be(Start.AddMonths(2));
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task PorVencer_five_days_before_due()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var atCreation = _fixture.Clock.Pin(AnchorInstant);
        var registered = await RegisterStoreAsync();
        try
        {
            var due = Start.AddMonths(2);
            using var atAssertion = _fixture.Clock.Pin(AtUtc(due.AddDays(-5)));
            var me = await MeAsync(AuthTestHelpers.BearerClient(_f, registered.Token));
            me.Data!.PaymentStatus.Should().Be("PorVencer");
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task EnGracia_from_due_plus_one_through_due_plus_five()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var atCreation = _fixture.Clock.Pin(AnchorInstant);
        var registered = await RegisterStoreAsync();
        try
        {
            var due = Start.AddMonths(2);
            var client = AuthTestHelpers.BearerClient(_f, registered.Token);

            using var atLowerBoundary = _fixture.Clock.Pin(AtUtc(due.AddDays(1)));
            (await MeAsync(client)).Data!.PaymentStatus.Should().Be("EnGracia");

            using var atUpperBoundary = _fixture.Clock.Pin(AtUtc(due.AddDays(5)));
            (await MeAsync(client)).Data!.PaymentStatus.Should().Be("EnGracia");
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task Vencido_from_due_plus_six()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var atCreation = _fixture.Clock.Pin(AnchorInstant);
        var registered = await RegisterStoreAsync();
        try
        {
            var due = Start.AddMonths(2);
            using var atAssertion = _fixture.Clock.Pin(AtUtc(due.AddDays(6)));
            var me = await MeAsync(AuthTestHelpers.BearerClient(_f, registered.Token));
            me.Data!.PaymentStatus.Should().Be("Vencido");
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task Vencido_store_keeps_only_free_modules()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var atCreation = _fixture.Clock.Pin(AnchorInstant);
        // Not via register (design D8 corollary: register assigns all six paid modules, too many
        // to make a crisp assertion) — one free + one paid module via the admin endpoint.
        var created = await CreateStoreViaApiAsync(new[] { StoreSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
        try
        {
            // Creation is still via the real API; only the "which store" pointer is seeded,
            // per GetMeBillingStatesTests.cs's pattern.
            await SetSelectedStoreIdAsync(created.OwnerUserId, created.StoreId);

            var due = Start.AddMonths(2);
            using var atAssertion = _fixture.Clock.Pin(AtUtc(due.AddDays(6)));
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, created.OwnerUserId, created.OwnerLogin));

            me.Data!.StoreModuleIds.Should().Contain(StoreSeed.ManagementModuleId);
            me.Data.StoreModuleIds.Should().NotContain(BillingSeed.StatisticsModuleId);
        }
        finally
        {
            await CleanupCreatedStoreAsync(created);
        }
    }

    // ---------------------------------------------------------------------
    // D. Collections (tests 15-16)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task New_store_absent_from_to_collect_during_trial()
    {
        // The "to collect" query reads ISystemConfigurationRepository uncached, so the pin still
        // matters for determinism even though the cache-eviction half is a no-op on this path.
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var clock = _fixture.Clock.Pin(AnchorInstant);

        var registered = await RegisterStoreAsync();
        var adminLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, adminLogin).GetAsync("/api/v1/stores/to-collect");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            body.Data.Should().NotContain(s => s.StoreId == registered.StoreId);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, registered.TenantId);
        }
    }

    [Fact]
    public async Task Free_plan_store_shows_zero_amount_in_to_collect()
    {
        await using var cfg = await BillingConfigSeed.PinAsync(_f);
        using var atCreation = _fixture.Clock.Pin(AnchorInstant);
        // A registered store has paid modules and cannot demonstrate this — free-only via the
        // admin endpoint.
        var created = await CreateStoreViaApiAsync(new[] { StoreSeed.ManagementModuleId });
        var adminLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        try
        {
            var due = Start.AddMonths(2);
            using var atAssertion = _fixture.Clock.Pin(AtUtc(due.AddDays(-3)));

            var response = await DbTestHelpers.AuthedClient(_f, adminId, adminLogin).GetAsync("/api/v1/stores/to-collect");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var entry = body.Data!.FirstOrDefault(s => s.StoreId == created.StoreId);
            entry.Should().NotBeNull();
            entry!.Amount.Should().Be(0);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
            await CleanupCreatedStoreAsync(created);
        }
    }
}
