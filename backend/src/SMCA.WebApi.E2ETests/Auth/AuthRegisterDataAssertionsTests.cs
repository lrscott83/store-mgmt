using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// Closes the S1-01 backend data-assertion gaps documented in docs/testing/e2e-stage-1/S1-01.md:53-59:
/// one [Fact] per persisted fact of the self-registration flow, following the register → read-DB →
/// cleanup convention of AuthRegisterSuccessTests. ADD-ONLY: no existing test is touched.
/// </summary>
[Collection("e2e")]
public sealed class AuthRegisterDataAssertionsTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthRegisterDataAssertionsTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    private sealed record Registered(Guid UserId, string Login, Guid TenantId, Guid StoreId, Guid OwnerId);

    /// <summary>
    /// Registers a fresh owner+store via the real endpoint and resolves the persisted
    /// tenant/store/owner from the database (owner by UserId, store scoped by tenant).
    /// </summary>
    private async Task<Registered> RegisterAsync(string storeName, string? code = null)
    {
        var login = $"regdata-{Guid.NewGuid():N}@test.com";
        var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = "E2E Owner",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = storeName,
            Code = code
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();

        var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
        user.Should().NotBeNull();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var owner = await db.Set<Owner>().IgnoreQueryFilters()
            .SingleOrDefaultAsync(o => o.UserId == user!.Id);
        owner.Should().NotBeNull();
        var store = await db.Set<Store>().IgnoreQueryFilters()
            .SingleOrDefaultAsync(s => s.TenantId == user!.TenantId);
        store.Should().NotBeNull();

        return new Registered(user!.Id, login, user!.TenantId, store!.Id, owner!.Id);
    }

    /// <summary>
    /// Tenant cascade cleanup mirroring AuthRegisterSuccessTests: re-resolves the tenant from the
    /// login when the register flow partially failed before the tenant id was captured.
    /// </summary>
    private async Task CleanupRegisteredAsync(Registered? registered)
    {
        if (registered is null) return;
        var tenantId = registered.TenantId;
        if (tenantId == Guid.Empty)
        {
            var created = await DbTestHelpers.GetUserByLoginAsync(_factory, registered.Login);
            if (created is not null) tenantId = created.TenantId;
        }
        if (tenantId != Guid.Empty)
            await DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId);
    }

    /// <summary>
    /// Seeds a ReSeller (User + UserRole + ReSeller row) whose User.Login equals <paramref name="code"/>,
    /// matching how RegisterCommand resolves the code via ReSellerRepository.GetByUserNameAsync.
    /// Pattern: RegisterStorePaymentTests.SeedReSellerWithStoreAsync (lines 49-56).
    /// </summary>
    private async Task<(Guid ReSellerId, Guid UserId)> SeedReSellerAsync(string code)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(code, DbTestHelpers.HashPassword("Password123"), "E2E ReSeller", "0000000000", code, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E ReSeller");
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        return (reSeller.Id, user.Id);
    }

    [Fact]
    public async Task Register_sets_SelectedStoreId_to_new_store_id()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, registered.Login);
            user!.SelectedStoreId.Should().Be(registered.StoreId);
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_composes_owner_description_from_store_name()
    {
        var storeName = $"Store-{Guid.NewGuid():N}";
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync(storeName);

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var owner = await db.Set<Owner>().IgnoreQueryFilters().SingleAsync(o => o.Id == registered.OwnerId);
            owner.Description.Should().Be($"Nombre de la tienda: {storeName}");
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_creates_store_with_test_description_and_not_approved()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == registered.StoreId);
            store.Description.Should().Be("Tienda de prueba");
            store.Approved.Should().BeFalse();
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_assigns_all_available_modules_including_paid()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Replicates ModuleRepository.GetAvailableModulesToStore (ModuleRepository.cs:17-23):
            // m.IsActive && m.AvailableToStore && m.Features.Any(f => f.IsActive && f.AvailableToStore).
            var expectedModuleIds = await db.Set<Module>().AsNoTracking()
                .Where(m => m.IsActive && m.AvailableToStore
                    && m.Features.Any(f => f.IsActive && f.AvailableToStore))
                .Select(m => m.Id)
                .ToListAsync();

            // Paid set: same filter plus !m.PriceIncluded. Precondition guard (CLAUDE.md): the
            // catalog must contain at least one qualifying paid module, otherwise set equality
            // would pass vacuously and the H-1 regression would go silent.
            var paidExpectedIds = await db.Set<Module>().AsNoTracking()
                .Where(m => m.IsActive && m.AvailableToStore
                    && m.Features.Any(f => f.IsActive && f.AvailableToStore)
                    && !m.PriceIncluded)
                .Select(m => m.Id)
                .ToListAsync();
            paidExpectedIds.Should().NotBeEmpty();

            var actualModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking()
                .Where(sm => sm.StoreId == registered.StoreId)
                .Select(sm => sm.ModuleId)
                .ToListAsync();

            actualModuleIds.Should().BeEquivalentTo(expectedModuleIds);
            actualModuleIds.Intersect(paidExpectedIds).Should().NotBeEmpty();
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_response_has_no_refresh_token()
    {
        var login = $"regdata-{Guid.NewGuid():N}@test.com";
        Registered? registered = null;
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "E2E Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = $"Store-{Guid.NewGuid():N}",
                Code = (string?)null
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.RefreshToken.Should().BeNull();
            body.Data.RefreshTokenExpiresAt.Should().BeNull();

            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            user.Should().NotBeNull();
            registered = new Registered(user!.Id, login, user.TenantId, Guid.Empty, Guid.Empty);
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_with_reseller_code_creates_ReSellerOwner()
    {
        var code = $"reseller-{Guid.NewGuid():N}";
        Registered? registered = null;
        var seeded = await SeedReSellerAsync(code);
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}", code);

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var reSellerOwner = await db.Set<ReSellerOwner>().IgnoreQueryFilters()
                .SingleAsync(rso => rso.OwnerId == registered.OwnerId);

            reSellerOwner.ReSellerId.Should().Be(seeded.ReSellerId);
            // Discounts are copied from the seeded ReSeller (RegisterCommand.cs:110): 0 / 25.
            reSellerOwner.DiscountPrice.Should().Be(0);
            reSellerOwner.PercentDiscountPrice.Should().Be(25);
            reSellerOwner.TenantId.Should().Be(registered.TenantId);
        }
        finally
        {
            // Cleanup ORDER is critical (design D4/D5):
            // 1) ReSellerOwner first — CleanupTenantCascadeAsync skips it and the FK
            //    ReSellerOwner→Owner is Restrict, so the tenant cascade would fail/leak otherwise.
            if (registered is not null)
            {
                using var scope = _factory.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var reSellerOwners = await db.Set<ReSellerOwner>().IgnoreQueryFilters()
                    .Where(rso => rso.OwnerId == registered.OwnerId).ToListAsync();
                db.Set<ReSellerOwner>().RemoveRange(reSellerOwners);
                await db.SaveChangesAsync();
            }

            // 2) Registered tenant cascade (Owner/Store/Modules/User/Tenant).
            await CleanupRegisteredAsync(registered);

            // 3) Seeded ReSeller row before its user — FK ReSeller→User is Restrict.
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var reSellers = await db.Set<ReSeller>().IgnoreQueryFilters()
                    .Where(r => r.Id == seeded.ReSellerId).ToListAsync();
                db.Set<ReSeller>().RemoveRange(reSellers);
                await db.SaveChangesAsync();
            }

            // 4) Seeded ReSeller user (UserRole + User; no Owner seeded).
            await DbTestHelpers.CleanupUserAsync(_factory, seeded.UserId);
        }
    }
}
