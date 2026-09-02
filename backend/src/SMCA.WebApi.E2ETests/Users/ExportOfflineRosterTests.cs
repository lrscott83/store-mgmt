using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Application.Abstractions.Authentication;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreUsers;
using Domain.Entities.Stores;
using Domain.Entities.SystemConfigurations;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class ExportOfflineRosterTests
{
    private readonly AppTestFactory _f;
    public ExportOfflineRosterTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task SuperAdmin_export_roster_returns_full_bundle()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Seed 2 store users
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "roster-u1", "User One");
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "roster-u2", "User Two");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var roster = body.Data!;
            roster.FormatVersion.Should().Be(3);
            roster.StoreId.Should().Be(owner.StoreId);
            Guid.TryParse(roster.BundleId, out _).Should().BeTrue();

            var msPerDay = 24 * 60 * 60 * 1000L;
            (roster.ExpiresAt - roster.IssuedAt).Should().Be(35 * msPerDay);

            // Owner + 2 store users = 3 total
            roster.Users.Should().HaveCount(3);
            foreach (var user in roster.Users)
            {
                user.Verifier.Should().NotBeNull();
                user.Verifier.Hash.Should().NotBeNullOrEmpty();
                user.Verifier.Salt.Should().NotBeNullOrEmpty();
                user.Verifier.Iterations.Should().Be(210_000);

                user.WrappedDek.Should().NotBeNullOrEmpty();
                user.WrapSalt.Should().NotBeNullOrEmpty();
                user.WrapIv.Should().NotBeNullOrEmpty();
                user.WrapIterations.Should().Be(210_000);
                user.PaymentStatus.Should().NotBeNullOrEmpty();
            }

            // Owner is included in the roster
            roster.Users.Should().Contain(u => u.IsOwnerAdmin);
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_own_store_returns_200()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "oa-user1", "OA User One");

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            // Owner + 1 store user = 2 total
            body.Data!.Users.Should().HaveCount(2);
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_foreign_store_returns_400()
    {
        var ownerA = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var ownerB = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, ownerA.UserId, ownerA.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{ownerB.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerA.StoreId, ownerA.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerB.StoreId, ownerB.UserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_empty_store_returns_empty_users()
    {
        var login = $"sa-empty-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // No StoreUsers seeded, but the owner is always included
            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Users.Should().HaveCount(1);
            body.Data.Users.Single().IsOwnerAdmin.Should().BeTrue();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_nonexistent_store_returns_empty_users()
    {
        var login = $"sa-nx-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var nonExistentStoreId = Guid.NewGuid();

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{nonExistentStoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Users.Should().BeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task Plain_store_user_returns_403()
    {
        var storeUser = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, storeUser.UserId, storeUser.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{storeUser.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, storeUser.StoreId, storeUser.UserId, storeUser.OwnerUserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_export_twice_DEK_stability()
    {
        var login = $"sa-dek-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "dek-u1", "DEK User One");
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "dek-u2", "DEK User Two");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);

            // First export
            var r1 = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r1.StatusCode.Should().Be(HttpStatusCode.OK);
            var body1 = await r1.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body1!.Succeeded.Should().BeTrue();
            var roster1 = body1.Data!;
            roster1.FormatVersion.Should().Be(3);
            // Owner + 2 store users = 3 total
            roster1.Users.Should().HaveCount(3);

            foreach (var user in roster1.Users)
            {
                user.WrappedDek.Should().NotBeNullOrEmpty();
                user.WrapSalt.Should().NotBeNullOrEmpty();
                user.WrapIv.Should().NotBeNullOrEmpty();
            }

            // Second export
            var r2 = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r2.StatusCode.Should().Be(HttpStatusCode.OK);
            var body2 = await r2.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body2!.Succeeded.Should().BeTrue();
            var roster2 = body2.Data!;
            roster2.FormatVersion.Should().Be(3);
            roster2.Users.Should().HaveCount(3);

            foreach (var user in roster2.Users)
            {
                user.WrappedDek.Should().NotBeNullOrEmpty();
                user.WrapSalt.Should().NotBeNullOrEmpty();
                user.WrapIv.Should().NotBeNullOrEmpty();
            }

            // WrappedDek differs between exports (different salt/IV per wrap)
            for (int i = 0; i < roster1.Users.Count; i++)
            {
                roster1.Users[i].WrappedDek.Should().NotBe(roster2.Users[i].WrappedDek);
            }

            // Unwrap each user's DEK from BOTH exports (KEK derived from the real stored
            // User.Password hash) and assert the recovered DEKs are byte-identical.
            for (int i = 0; i < roster1.Users.Count; i++)
            {
                var user1 = roster1.Users[i];
                var user2 = roster2.Users[i];
                user1.Id.Should().Be(user2.Id);

                string storedPasswordHash;
                using (var scope = _f.Services.CreateScope())
                {
                    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                    var encryptedPreHash = await db.Set<User>().IgnoreQueryFilters()
                        .Where(u => u.Id == user1.Id)
                        .Select(u => u.OfflinePasswordPreHash)
                        .SingleAsync();
                    var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
                    storedPasswordHash = preHashProtector.Unprotect(encryptedPreHash, user1.Id)!;
                }

                var dek1 = UnwrapDek(storedPasswordHash, user1.WrappedDek, user1.WrapSalt, user1.WrapIv, user1.WrapIterations);
                var dek2 = UnwrapDek(storedPasswordHash, user2.WrappedDek, user2.WrapSalt, user2.WrapIv, user2.WrapIterations);

                dek1.Should().HaveCount(32);
                dek1.Should().BeEquivalentTo(dek2);
            }
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_export_vencidoStore_exportsOnlyPriceIncludedModules()
    {
        using var _ = _f.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));
        var seeded = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2020, 1, 1));

        try
        {
            await SetSelectedStoreAsync(seeded.UserId, seeded.StoreId);
            await SeedStoreUserAsync(seeded.StoreId, seeded.TenantId, "venc-u1", "Vencido User One");

            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{seeded.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Owner + 1 store user; assert on the store user (non-owner)
            var storeUser = body.Data!.Users.Single(u => !u.IsOwnerAdmin);
            // Vencido → only PriceIncluded (Management=7) survives; paid Statistics=6 is filtered out
            storeUser.StoreModuleIds.Should().BeEquivalentTo(new[] { BillingSeed.ManagementModuleId });
            storeUser.PaymentStatus.Should().Be("Vencido");
            storeUser.PaymentDueDate.Should().NotBeNull();
            storeUser.IsInTrial.Should().BeFalse();
        }
        finally
        {
            await CleanupStoreUsersAsync(seeded.StoreId);
            await BillingSeed.CleanupAsync(_f, seeded);
        }
    }

    [Fact]
    public async Task OwnerAdmin_export_aldiaStore_exportsAllModules()
    {
        using var _ = _f.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));
        var seeded = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 5, 18));
        await BillingSeed.SeedPaymentAsync(
            _f,
            seeded.StoreId,
            amount: 1000f,
            reSellerId: null,
            reSellerPercentDiscountPrice: 0f,
            byReSeller: false,
            seeded.TenantId);

        try
        {
            await SetSelectedStoreAsync(seeded.UserId, seeded.StoreId);
            await SeedStoreUserAsync(seeded.StoreId, seeded.TenantId, "aldia-u1", "AlDia User One");

            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{seeded.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Owner + 1 store user; assert on the store user (non-owner)
            var storeUser = body.Data!.Users.Single(u => !u.IsOwnerAdmin);
            // AlDia → all modules survive the gate (free + paid)
            storeUser.StoreModuleIds.Should().BeEquivalentTo(new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
            storeUser.PaymentStatus.Should().BeOneOf("AlDia", "PorVencer");
        }
        finally
        {
            await CleanupStoreUsersAsync(seeded.StoreId);
            await BillingSeed.CleanupAsync(_f, seeded);
        }
    }

    [Fact]
    public async Task OwnerAdmin_export_noAplicaStore_exportsAllModules()
    {
        var seeded = await SeedNoAplicaStoreAsync(_f);

        try
        {
            await SetSelectedStoreAsync(seeded.UserId, seeded.StoreId);
            await SeedStoreUserAsync(seeded.StoreId, seeded.TenantId, "noap-u1", "NoAplica User One");

            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{seeded.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Owner + 1 store user; assert on the store user (non-owner)
            var storeUser = body.Data!.Users.Single(u => !u.IsOwnerAdmin);
            // NoAplica (never started billing) → all modules survive the gate
            storeUser.StoreModuleIds.Should().BeEquivalentTo(new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
            storeUser.PaymentStatus.Should().Be("NoAplica");
            storeUser.PaymentDueDate.Should().BeNull();
            storeUser.IsInTrial.Should().BeFalse();
        }
        finally
        {
            await CleanupStoreUsersAsync(seeded.StoreId);
            await BillingSeed.CleanupAsync(_f, seeded);
        }
    }

    [Fact]
    public async Task OwnerAdmin_export_roster_matches_me_output_for_user()
    {
        using var _ = _f.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));
        var seeded = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 5, 18));
        await BillingSeed.SeedPaymentAsync(
            _f,
            seeded.StoreId,
            amount: 1000f,
            reSellerId: null,
            reSellerPercentDiscountPrice: 0f,
            byReSeller: false,
            seeded.TenantId);

        try
        {
            // BillingSeed does not set SelectedStoreId; the OwnerAdmin exporter needs a real
            // StoreIdClaim for the UsersAdmin permission filter to resolve.
            await SetSelectedStoreAsync(seeded.UserId, seeded.StoreId);

            // Plain StoreUser granted the Stores feature so the roster's Roles entry for the
            // seeded store is non-empty, making the parity comparison meaningful.
            var storeUser = await SeedStoreUserWithFeatureAsync(seeded.StoreId, seeded.TenantId, "parity-u1", "Parity User One");

            // Export as the store's OWNER ADMIN — not a SuperAdmin. The role-feature query is
            // tenant-scoped via (TenantId == ctx.TenantId || ctx.IsSuperAdmin); a SuperAdmin
            // export bypasses that filter and can surface cross-tenant StoreRoleFeature rows
            // that the target user's /me (tenant-scoped) never returns. Exporting as the
            // OwnerAdmin keeps both endpoints tenant-scoped, so the comparison is apples-to-
            // apples for the R5 S1 "for that user in that store" parity.
            var rosterResponse = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .GetAsync($"/api/v1/StoreUsers/{seeded.StoreId}/offline-roster");
            rosterResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var rosterBody = await rosterResponse.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            rosterBody!.Succeeded.Should().BeTrue();

            var rosterUser = rosterBody.Data!.Users.Single(u => u.Id == storeUser.UserId);

            // /me requires the target user's own JWT session, so the actor here is the store
            // user, not the exporting OwnerAdmin.
            var meResponse = await DbTestHelpers.AuthedClient(_f, storeUser.UserId, storeUser.Login)
                .GetAsync("/api/v1/auth/me");
            meResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var meBody = await meResponse.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            meBody!.Succeeded.Should().BeTrue();
            var me = meBody.Data!;

            // R5 S1 parity: the roster dimensions equal what /me returns for the same user in
            // the same store. Lists are order-independent because each endpoint may order them
            // differently (module ordering vs insertion order; feature ordering per service).
            rosterUser.Roles.Should().BeEquivalentTo(me.Roles);
            rosterUser.FeatureIds.Should().BeEquivalentTo(me.FeatureIds);
            rosterUser.StoreModuleIds.Should().BeEquivalentTo(me.StoreModuleIds);
            rosterUser.IsSuperAdmin.Should().Be(me.IsSuperAdmin);
            rosterUser.IsOwnerAdmin.Should().Be(me.IsOwnerAdmin);
            rosterUser.IsReSeller.Should().Be(me.IsReSeller);
        }
        finally
        {
            await CleanupStoreUsersAsync(seeded.StoreId);
            await BillingSeed.CleanupAsync(_f, seeded);
        }
    }

    [Fact]
    public async Task SuperAdmin_export_configuredTtl7_applies7Days()
    {
        var login = $"sa-ttl-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        var originalValue = await GetOfflineRosterTtlValueAsync();

        try
        {
            await SetOfflineRosterTtlValueAsync("7");
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "ttl-u1", "TTL User One");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var roster = body.Data!;

            var msPerDay = 24 * 60 * 60 * 1000L;
            (roster.ExpiresAt - roster.IssuedAt).Should().Be(7 * msPerDay);
        }
        finally
        {
            await RestoreOfflineRosterTtlValueAsync(originalValue);
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_export_deletedTtlRow_usesDefault35()
    {
        var login = $"sa-ttl35-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        var originalValue = await GetOfflineRosterTtlValueAsync();

        try
        {
            await DeleteOfflineRosterTtlRowAsync();
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "ttl35-u1", "TTL35 User One");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var roster = body.Data!;

            var msPerDay = 24 * 60 * 60 * 1000L;
            (roster.ExpiresAt - roster.IssuedAt).Should().Be(35 * msPerDay);
        }
        finally
        {
            await RestoreOfflineRosterTtlValueAsync(originalValue);
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_export_unwrappedDek_byteEqualsGetDek()
    {
        var login = $"sa-dek-eq-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "dekeq-u1", "DEK Equal User");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            var user = body!.Data!.Users.Single(u => !u.IsOwnerAdmin);

            user.WrapIterations.Should().Be(210_000);

            string storedPasswordHash;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var encryptedPreHash = await db.Set<User>().IgnoreQueryFilters()
                    .Where(u => u.Id == user.Id)
                    .Select(u => u.OfflinePasswordPreHash)
                    .SingleAsync();
                var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
                storedPasswordHash = preHashProtector.Unprotect(encryptedPreHash, user.Id)!;
            }

            // Recover the DEK from wire fields ONLY (KEK from stored hash + salt + wire iterations)
            var recovered = UnwrapDek(storedPasswordHash, user.WrappedDek, user.WrapSalt, user.WrapIv, user.WrapIterations);

            using var providerScope = _f.Services.CreateScope();
            var dataKeyProvider = providerScope.ServiceProvider.GetRequiredService<IStoreDataKeyProvider>();
            var expected = dataKeyProvider.GetDek(owner.StoreId);

            recovered.Should().HaveCount(32);
            recovered.Should().BeEquivalentTo(expected);
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch()
    {
        var login = $"sa-dek-raw-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "dekraw-u1", "DEK Raw User");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            var user = body!.Data!.Users.Single(u => !u.IsOwnerAdmin);

            // KEK derived from the RAW password instead of the stored hash → tag mismatch
            var act = () => UnwrapDek("Password123", user.WrappedDek, user.WrapSalt, user.WrapIv, user.WrapIterations);

            act.Should().Throw<AuthenticationTagMismatchException>();
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    private static byte[] UnwrapDek(string storedPasswordHash, string wrappedDek, string wrapSalt, string wrapIv, int iterations)
    {
        // Mirrors StoreKeyWrapService: KEK = Pbkdf2(UTF8(hash), salt, iterations, SHA256, 32);
        // wire format = Base64(ciphertext || tag), tag = 16 bytes; IV = 12 bytes.
        byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(storedPasswordHash),
            Convert.FromBase64String(wrapSalt),
            iterations,
            HashAlgorithmName.SHA256,
            32);

        byte[] wrapped = Convert.FromBase64String(wrappedDek);
        byte[] ciphertext = wrapped[..^16];
        byte[] tag = wrapped[^16..];

        byte[] dek = new byte[32];
        using var aesGcm = new AesGcm(kek, 16);
        aesGcm.Decrypt(Convert.FromBase64String(wrapIv), ciphertext, tag, dek);
        return dek;
    }

    [Fact]
    public async Task Inactive_store_user_is_excluded_from_roster()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Seed an active store user
            var activeUserId = await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "active-u", "Active User");
            // Seed an inactive store user
            var inactiveUserId = await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "inactive-u", "Inactive User");
            await DeactivateUserAsync(inactiveUserId);

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Owner + 1 active user = 2 (inactive user excluded)
            body.Data!.Users.Should().HaveCount(2);
            body.Data.Users.Should().Contain(u => u.Id == activeUserId);
            body.Data.Users.Should().NotContain(u => u.Id == inactiveUserId);
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    [Fact]
    public async Task Inactive_owner_is_excluded_from_roster()
    {
        // Use SuperAdmin to export so the middleware doesn't block the deactivated owner
        var login = $"sa-inactiveowner-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Deactivate the owner's user
            await DeactivateUserAsync(owner.UserId);

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");

            // Roster download should be blocked when the owner is inactive
            r.StatusCode.Should().NotBe(HttpStatusCode.OK);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task Inactive_store_should_not_allow_roster_download()
    {
        var login = $"sa-inactive-store-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Deactivate the store
            await DeactivateStoreAsync(owner.StoreId);

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");

            // Should fail — inactive store should not allow roster download
            r.StatusCode.Should().NotBe(HttpStatusCode.OK);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task Inactive_owner_should_not_allow_roster_download()
    {
        var login = $"sa-inactive-owner-dl-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Deactivate the owner's user
            await DeactivateUserAsync(owner.UserId);

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");

            // Should fail — inactive owner should not allow roster download
            r.StatusCode.Should().NotBe(HttpStatusCode.OK);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    private async Task DeactivateStoreAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == storeId);
        store.IsActive = false;
        db.Entry(store).State = EntityState.Modified;
        await db.SaveChangesAsync();
    }

    private async Task DeactivateUserAsync(Guid userId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = await db.Set<User>().IgnoreQueryFilters().SingleAsync(u => u.Id == userId);
        user.IsActive = false;
        db.Entry(user).State = EntityState.Modified;
        await db.SaveChangesAsync();
    }

    private async Task<Guid> SeedStoreUserAsync(Guid storeId, Guid tenantId, string prefix, string fullName)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"{prefix}-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), fullName, "0000000000", login, tenantId);
        user.SelectedStoreId = storeId;
        var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, storeId, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        await db.SaveChangesAsync();
        return user.Id;
    }

    /// <summary>
    /// Like <see cref="SeedStoreUserAsync"/> but also grants the Stores feature (in the Management
    /// module) so the roster and /me produce non-empty Roles/FeatureIds for the parity comparison.
    /// </summary>
    private async Task<(Guid UserId, string Login)> SeedStoreUserWithFeatureAsync(Guid storeId, Guid tenantId, string prefix, string fullName)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"{prefix}-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), fullName, "0000000000", login, tenantId);
        user.SelectedStoreId = storeId;
        var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, storeId, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(storeId, (int)RoleType.StoreUser, AuthzSeed.StoresFeatureId, tenantId));
        await db.SaveChangesAsync();
        return (user.Id, login);
    }

    private async Task CleanupStoreUsersAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var userIds = await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).Select(su => su.UserId).ToListAsync();
        await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).ExecuteDeleteAsync();

        foreach (var uid in userIds)
        {
            await RemoveWhere<UserRole>(db, r => r.UserId == uid);
            await RemoveWhere<User>(db, u => u.Id == uid);
        }
    }

    private static async Task RemoveWhere<T>(ApplicationDbContext db,
        System.Linq.Expressions.Expression<Func<T, bool>> pred) where T : class
    {
        await db.Set<T>().IgnoreQueryFilters().Where(pred).ExecuteDeleteAsync();
    }

    /// <summary>
    /// Sets the user's SelectedStoreId so the claims transformer emits a real StoreIdClaim —
    /// BillingSeed does not set it, and the UsersAdmin permission filter needs it to resolve modules.
    /// </summary>
    private async Task SetSelectedStoreAsync(Guid userId, Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = await db.Set<User>().IgnoreQueryFilters().SingleAsync(u => u.Id == userId);
        user.SelectedStoreId = storeId;
        // DbContext uses NoTracking by default — attach explicitly so the change persists.
        db.Entry(user).State = EntityState.Modified;
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Creates a store with PaymentStartDate null (never started billing → NoAplica) carrying BOTH
    /// a free (Management, PriceIncluded) and a paid (Statistics) module, plus an OwnerAdmin user.
    /// </summary>
    private static async Task<BillingSeed.SeededStore> SeedNoAplicaStoreAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"noaplica-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E NoAplica Store", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        var owner = Owner.Create(user.Id, false, tenantId, "E2E NoAplica Store Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"NoAplica-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate: null);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Free module: Management (id=7), PriceIncluded=true
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, BillingSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        // Paid module: Statistics (id=6), PriceIncluded=false
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, BillingSeed.StatisticsModuleId, 1000f, false, 1000f, 0, 0, tenantId));
        await db.SaveChangesAsync();

        return new BillingSeed.SeededStore(user.Id, login, owner.Id, store.Id, tenantId);
    }

    private async Task<string?> GetOfflineRosterTtlValueAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var row = await db.Set<SystemConfiguration>().IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == (int)SystemConfigurationType.OfflineRosterTtlDays);
        return row?.Value;
    }

    private async Task SetOfflineRosterTtlValueAsync(string value)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var row = await db.Set<SystemConfiguration>().IgnoreQueryFilters()
            .SingleAsync(c => c.Id == (int)SystemConfigurationType.OfflineRosterTtlDays);
        row.Value = value;
        // DbContext uses NoTracking by default — attach explicitly so the change persists.
        db.Entry(row).State = EntityState.Modified;
        await db.SaveChangesAsync();
    }

    private async Task DeleteOfflineRosterTtlRowAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var row = await db.Set<SystemConfiguration>().IgnoreQueryFilters()
            .SingleAsync(c => c.Id == (int)SystemConfigurationType.OfflineRosterTtlDays);
        db.Set<SystemConfiguration>().Remove(row);
        await db.SaveChangesAsync();
    }

    private async Task RestoreOfflineRosterTtlValueAsync(string? originalValue)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var existing = await db.Set<SystemConfiguration>().IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Id == (int)SystemConfigurationType.OfflineRosterTtlDays);
        if (existing is not null)
        {
            existing.Value = originalValue ?? "35";
            // DbContext uses NoTracking by default — attach explicitly so the change persists.
            db.Entry(existing).State = EntityState.Modified;
            await db.SaveChangesAsync();
            return;
        }

        // Row was deleted — re-create it so other tests keep working.
        db.Set<SystemConfiguration>().Add(SystemConfiguration.Create(
            (int)SystemConfigurationType.OfflineRosterTtlDays,
            SystemConfigurationType.OfflineRosterTtlDays.GetDisplayName(),
            originalValue ?? "35"));
        await db.SaveChangesAsync();
    }
}
