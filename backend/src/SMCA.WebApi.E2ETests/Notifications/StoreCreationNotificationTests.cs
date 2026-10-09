using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.Messages;
using Domain.Entities.Notifications;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Tenants;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Notifications;

/// <summary>
/// <c>CreateStoreCommandHandler.Handle</c> emits ONE <c>Notification</c> for the SuperAdmin after a
/// successful <c>POST /v1/stores</c>, reusing <c>OwnerRegistrationNotification.Resolve</c> — zero
/// schema change, and the emit lives in the HANDLER rather than in <c>ICreateStoreService</c>
/// because that service also backs owner registration and notifying there would double-notify
/// every signup.
/// <para>
/// ADD-ONLY: this is a new spec file. No existing E2E test or support file is modified.
/// </para>
/// <para>
/// This exists as E2E and not as a unit test for the same reason its sibling
/// (<c>OwnerRegistrationNotificationTests</c>) does: the property under test is an ORDERING
/// property across two independent units of work. The handler owns a single commit; the
/// notification repository commits on its own. Writing the notice before the handler's save would
/// flush first, leave nothing staged, make the handler's save return 0 and fail EVERY store
/// creation. Only a real database and a real request can observe that.
/// </para>
/// <para>
/// The load-bearing assertion is not "a notice appeared" but "the SECOND store's notice is the
/// only new one": creating another store must not duplicate or disturb the notice the first store
/// already earned at registration.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class StoreCreationNotificationTests
{
    private const int MultiStoresModuleId = (int)ModuleType.MultiStores;
    private const int SuperiorPlanId = (int)StorePlanType.Superior;

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public StoreCreationNotificationTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Owner_store_creation_leaves_exactly_one_notification_and_never_disturbs_the_first()
    {
        var login = $"snotif-{Guid.NewGuid():N}@test.com";
        var firstStoreName = $"SNotif-First-{Guid.NewGuid():N}";
        var secondStoreName = $"SNotif-Second-{Guid.NewGuid():N}";
        var ownerFullName = "Rocío Peña";
        var ownerCellPhone = "8095550222";
        var adminLogin = $"sa-snotif-{Guid.NewGuid():N}@test.com";

        Guid adminId = Guid.Empty;
        Guid userId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            // ── 1. Register a REAL owner through the REAL endpoint ────────────────────────────
            // One call produces owner + user + FIRST store + the FIRST store's notice. That is
            // the baseline the second creation must not disturb.
            var registerResponse = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = ownerFullName,
                CellPhone = ownerCellPhone,
                Email = (string?)null,
                StoreName = firstStoreName,
                Code = (string?)null
            });

            registerResponse.StatusCode.Should().Be(HttpStatusCode.Created,
                "the notice is a courtesy write and must never be able to fail a registration");

            // ── 2. THE PRECONDITION, asserted before anything under test ─────────────────────
            // Without these, "zero notices for the second store" would be indistinguishable from
            // "the fixture never wrote anything at all" (spec R, AGENTS.md: pin the state that
            // triggers the filter before asserting the filtered effect).
            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            user.Should().NotBeNull("the registration itself must have committed");
            userId = user!.Id;
            tenantId = user.TenantId;

            Guid ownerId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                ownerId = await db.Set<Owner>().IgnoreQueryFilters()
                    .Where(o => o.UserId == userId)
                    .Select(o => o.Id)
                    .SingleAsync();
            }

            Guid firstStoreId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                firstStoreId = await db.Set<Store>().IgnoreQueryFilters()
                    .Where(s => s.OwnerId == ownerId && s.Name == firstStoreName)
                    .Select(s => s.Id)
                    .SingleAsync();
            }

            var firstNotices = await NotificationsForAsync(firstStoreName);
            firstNotices.Should().HaveCount(1,
                "self-registration already owes exactly one notice — this is the baseline the " +
                "second creation must leave alone");

            // ── 3. Give the owner's SELECTED store the MultiStores module ─────────────────────
            // Required setup, not decoration. A self-registered store is born on Pago
            // (RegisterService grants the ACTIVE Pago catalog), and MultiStores (14) is a
            // Superior/VIP-only member — so the handler's owner branch would 403 the owner before
            // ever reaching the emit. POST /v1/stores/{id}/change-plan driven by a SuperAdmin
            // materialises the Superior universe (module rows + StoreRoleFeatures) for real,
            // instead of hand-writing a StoreModule the production flow would never produce.
            adminId = await DbTestHelpers.SeedSuperAdminAsync(_factory, adminLogin, "Password123");
            var changePlanResponse = await DbTestHelpers.AuthedClient(_factory, adminId, adminLogin)
                .PostAsJsonAsync($"/api/v1/stores/{firstStoreId}/change-plan",
                    new { storePlanId = SuperiorPlanId });
            changePlanResponse.StatusCode.Should().Be(HttpStatusCode.OK,
                "SuperAdmin is the only caller allowed to target Superior/VIP");

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var hasMultiStores = await db.Set<Domain.Entities.StoreModules.StoreModule>()
                    .IgnoreQueryFilters()
                    .AnyAsync(sm => sm.StoreId == firstStoreId && sm.ModuleId == MultiStoresModuleId && sm.IsActive);
                hasMultiStores.Should().BeTrue(
                    "the plan change must actually hand the owner the MultiStores gate the create " +
                    "endpoint requires — otherwise a 403 below would be a fixture failure, not a product one");
            }

            // ── 4. THE ACT: authenticate AS THAT OWNER and create a SECOND store ─────────────
            // Owner-branch body contract (CreateStoreCommandValidator: the OwnerAdmin branch is
            // exempt from the OwnerId / ModuleIds rules): zero-Guid OwnerId means "derive mine"
            // and ModuleIds is ignored in favour of inheriting from the selected store.
            var createResponse = await DbTestHelpers.AuthedClient(_factory, userId, login)
                .PostAsJsonAsync("/api/v1/stores", new
                {
                    OwnerId = Guid.Empty,
                    Name = secondStoreName,
                    Address = (string?)"",
                    Description = (string?)"",
                    Approved = true,
                    ModuleIds = Array.Empty<int>()
                });

            createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
            var createdBody = await createResponse.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            createdBody!.Succeeded.Should().BeTrue();
            Guid secondStoreId = createdBody.Data!.Id;

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Id == secondStoreId))
                    .Should().BeTrue("the second store must be persisted before its notice means anything");
            }

            // ── 5. Exactly ONE notice for the SECOND store, carrying the three facts ──────────
            var secondNotices = await NotificationsForAsync(secondStoreName);
            secondNotices.Should().HaveCount(1,
                "one successful POST /v1/stores emits exactly one notice; two would mean the emit " +
                "is reachable twice (handler + ICreateStoreService), which is the double-notify " +
                "this feature document exists to prevent");

            var notice = secondNotices[0];
            notice.Id.Should().NotBe(firstNotices[0].Id,
                "the second store's notice is a NEW row, not the first store's row relabelled");
            notice.OwnerName.Should().Be(ownerFullName,
                "the notice must name the owner whose store it is");
            notice.OwnerCellPhone.Should().Be(ownerCellPhone,
                "the phone comes off owner.User, which GetOwnerIncludingUserByIdAsync already loads");
            notice.StoreName.Should().Be(secondStoreName, "the notice must name the store that was opened");

            // ── 6. Fresh and unread — that is what makes the bell's badge non-zero ────────────
            notice.ReadAt.Should().BeNull();
            notice.IsActive.Should().BeTrue();
            notice.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(5));

            // ── 7. THE LOAD-BEARING HALF: the first store still has exactly one notice ────────
            (await NotificationsForAsync(firstStoreName)).Should().HaveCount(1,
                "creating a second store must not duplicate, rename or disturb the notice the " +
                "first store already earned at registration");
        }
        finally
        {
            if (userId != Guid.Empty)
            {
                await CleanupEverythingAsync(userId, tenantId, new List<string> { firstStoreName, secondStoreName });
            }

            if (adminId != Guid.Empty)
            {
                await DbTestHelpers.CleanupUserAsync(_factory, adminId);
            }
        }
    }

    /// <summary>
    /// Reads a store's notices straight from the table with <c>IgnoreQueryFilters</c>, because
    /// that is the layer the ordering constraint actually governs — and because Notification
    /// carries no FK and no TenantId, so nothing else can reach these rows.
    /// </summary>
    private async Task<List<Notification>> NotificationsForAsync(string storeName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        return await db.Set<Notification>()
            .IgnoreQueryFilters()
            .Where(n => n.StoreName == storeName)
            .ToListAsync();
    }

    /// <summary>
    /// Removes everything this test created, in dependency order.
    /// <para>
    /// <c>DbTestHelpers.CleanupUserAsync</c> is deliberately NOT used: it deletes Store without
    /// first deleting the StoreRoleFeature / StoreModule / StoreUser / StoreUsage rows a real
    /// registration creates, so against a genuinely registered owner it dies with 23503 on
    /// FK_StoreRoleFeature_Store_StoreId. The shared helper is E2E infrastructure and was left
    /// untouched; the teardown this test needs lives here.
    /// </para>
    /// <para>
    /// ExecuteDeleteAsync throughout: no tracking, no query filters, and each statement is its own
    /// command, so order is explicit instead of relying on EF's batch ordering.
    /// </para>
    /// </summary>
    private async Task CleanupEverythingAsync(Guid userId, Guid tenantId, List<string> storeNames)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Notification carries no FK and no TenantId, so neither CleanupUserAsync nor
        // CleanupTenantCascadeAsync can reach it. Both of this test's notices must go or they
        // accumulate in the shared e2e database across runs.
        await db.Set<Notification>().IgnoreQueryFilters()
            .Where(n => storeNames.Contains(n.StoreName))
            .ExecuteDeleteAsync();

        var storeIds = await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Name != null && storeNames.Contains(s.Name))
            .Select(s => s.Id)
            .ToListAsync();

        var ownerIds = await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => o.UserId == userId)
            .Select(o => o.Id)
            .ToListAsync();

        // Conversation.OwnerId is the owner's USER id, not the Owner entity id. Registration
        // posts a welcome greeting, so this subtree is never empty here.
        var conversationIds = await db.Set<Conversation>().IgnoreQueryFilters()
            .Where(c => c.OwnerId == userId)
            .Select(c => c.Id)
            .ToListAsync();

        await db.Set<Message>().IgnoreQueryFilters()
            .Where(m => conversationIds.Contains(m.ConversationId))
            .ExecuteDeleteAsync();
        await db.Set<Conversation>().IgnoreQueryFilters()
            .Where(c => conversationIds.Contains(c.Id))
            .ExecuteDeleteAsync();

        // Every one of these hangs off Store with DeleteBehavior.Restrict.
        await db.Set<Domain.Entities.StoreRoleFeatures.StoreRoleFeature>().IgnoreQueryFilters()
            .Where(x => storeIds.Contains(x.StoreId)).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.StoreModules.StoreModule>().IgnoreQueryFilters()
            .Where(x => storeIds.Contains(x.StoreId)).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.StoreUsers.StoreUser>().IgnoreQueryFilters()
            .Where(x => storeIds.Contains(x.StoreId)).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.StoreUsages.StoreUsage>().IgnoreQueryFilters()
            .Where(x => storeIds.Contains(x.StoreId)).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.StorePayments.StorePayment>().IgnoreQueryFilters()
            .Where(x => storeIds.Contains(x.StoreId)).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => storeIds.Contains(s.Id)).ExecuteDeleteAsync();

        await db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>().IgnoreQueryFilters()
            .Where(r => ownerIds.Contains(r.OwnerId)).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => ownerIds.Contains(o.Id)).ExecuteDeleteAsync();

        await db.Set<Domain.Entities.Authentication.RefreshToken>().IgnoreQueryFilters()
            .Where(t => t.UserId == userId).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters()
            .Where(ur => ur.UserId == userId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == userId).ExecuteDeleteAsync();

        // Self-registration mints its OWN Tenant (CreateOwnerService.CreateOwnerAsync), so the
        // tenant is this test's residue too. Restrict FKs are all satisfied by the deletes above.
        await db.Set<Tenant>().IgnoreQueryFilters()
            .Where(t => t.Id == tenantId).ExecuteDeleteAsync();
    }
}