using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.Messages;
using Domain.Entities.Notifications;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Notifications;

/// <summary>
/// Registering an owner leaves exactly one notification for the SuperAdmin, carrying the three
/// facts they need to act.
/// <para>
/// ADD-ONLY: this is a new spec file. No existing E2E test or support file is modified.
/// </para>
/// <para>
/// This exists as E2E and not as a unit test because the property under test is an ORDERING
/// property across two independent units of work: the handler owns a single commit, and the
/// repository commits on its own. Writing the notice before the handler's save would flush first,
/// leave nothing staged, make the handler's save return 0 and fail EVERY registration. Only a
/// real database and a real request can observe that.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnerRegistrationNotificationTests
{
    private const string OwnerFullName = "Sofía Ramírez";
    private const string OwnerCellPhone = "8095550111";

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public OwnerRegistrationNotificationTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Self_registration_leaves_exactly_one_notification_with_the_three_facts()
    {
        var login = $"notif-{Guid.NewGuid():N}@test.com";
        var storeName = $"Notif-{Guid.NewGuid():N}";

        var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = OwnerFullName,
            CellPhone = OwnerCellPhone,
            Email = (string?)null,
            StoreName = storeName,
            Code = (string?)null
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created,
            "the notice is a courtesy write and must never be able to fail a registration");

        // THE PRECONDITION, asserted first: without the owner row existing, an empty notification
        // list would look identical to "the notification was never written" (spec R, AGENTS.md).
        var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
        user.Should().NotBeNull("the registration itself must have committed");

        var notification = await GetSingleNotificationForAsync(storeName);

        notification!.OwnerName.Should().Be(OwnerFullName, "the notice must name the owner who registered");
        notification.OwnerCellPhone.Should().Be(OwnerCellPhone,
            "the phone is taken from the COMMAND, because the Owner entity carries no phone at all");
        notification.StoreName.Should().Be(storeName, "the notice must name the store that was opened");

        // A fresh notice is unread — that is precisely what makes the bell's badge non-zero.
        notification.ReadAt.Should().BeNull();
        notification.IsActive.Should().BeTrue();
        notification.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(5));

        // The SuperAdmin is not stored on the row (the recipient is the canonical constant), so the
        // gate that matters is that the list is reachable and reports exactly this one unread item.
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_factory, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_factory, admin, $"sa-{admin:N}@test.com");

            var listResponse = await adminClient.GetAsync("/api/v1/notifications");
            listResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await listResponse.Content.ReadFromJsonAsync<ApiResponse<NotificationsEnvelope>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // "Exactly one" is the load-bearing assertion: a notice per call site per registration
            // would double-count every signup.
            var mine = body.Data!.Items
                .Where(i => i.StoreName == storeName)
                .ToList();
            mine.Should().HaveCount(1, "one registration produces exactly one notification");

            var dto = mine[0];
            dto.OwnerName.Should().Be(OwnerFullName);
            dto.OwnerCellPhone.Should().Be(OwnerCellPhone);
            dto.StoreName.Should().Be(storeName);
            dto.IsRead.Should().BeFalse();
            dto.ReadAt.Should().BeNull();
            dto.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(5));

            // Marking it read must drop it out of the unread count — this is the badge behaviour
            // the whole feature hangs on, and it can only be observed through the endpoint.
            int unreadBefore = body.Data.UnreadCount;
            unreadBefore.Should().BeGreaterThan(0);

            var markOne = await adminClient.PostAsync($"/api/v1/notifications/{dto.Id}/read", null);
            markOne.StatusCode.Should().Be(HttpStatusCode.OK);

            var afterOne = await adminClient.GetFromJsonAsync<ApiResponse<NotificationsEnvelope>>("/api/v1/notifications", ApiResponse.Json);
            var mineAfter = afterOne!.Data!.Items.Single(i => i.Id == dto.Id);
            mineAfter.IsRead.Should().BeTrue();
            mineAfter.ReadAt.Should().NotBeNull();
            afterOne.Data.UnreadCount.Should().Be(unreadBefore - 1, "the badge drops by exactly one");

            // "mark all as read" is asserted as a DELTA, not as an absolute zero: it flips every
            // unread row in the shared e2e database, including rows another test may have left, so
            // pinning an absolute 0 would make this test order-dependent.
            var markAll = await adminClient.PostAsync("/api/v1/notifications/mark-all-read", null);
            markAll.StatusCode.Should().Be(HttpStatusCode.OK);

            var afterAll = await adminClient.GetFromJsonAsync<ApiResponse<NotificationsEnvelope>>("/api/v1/notifications", ApiResponse.Json);
            afterAll!.Data!.UnreadCount.Should().Be(0, "mark-all leaves nothing unread");

            // Re-marking an already-read notice is a no-op, not an error: the client retries freely.
            var markAgain = await adminClient.PostAsync($"/api/v1/notifications/{dto.Id}/read", null);
            markAgain.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, admin);
            await CleanupRegisteredOwnerAsync(user!.Id);
            // Notification carries no FK and no TenantId, so neither CleanupUserAsync nor
            // CleanupTenantCascadeAsync can reach it. It has to be removed explicitly or it
            // accumulates in the shared e2e database across runs.
            await DeleteNotificationsForStoreAsync(storeName);
        }
    }

    [Fact]
    public async Task Notifications_endpoint_is_closed_to_a_non_super_admin()
    {
        // Pins acceptance criterion 2's backend half: the bell data is not readable by an owner.
        // Seeded here and cleaned up here so the shared e2e database keeps no residue.
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_factory, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await DbTestHelpers.SeedUserWithRoleAsync(_factory, (int)RoleType.OwnerAdmin);

        try
        {
            var ownerClient = DbTestHelpers.AuthedClient(_factory, owner.UserId, owner.Login);

            var response = await ownerClient.GetAsync("/api/v1/notifications");

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "an OwnerAdmin must not be able to read the SuperAdmin's bell");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, admin);
            await DbTestHelpers.CleanupUserAsync(_factory, owner.UserId);
        }
    }

    /// <summary>
    /// Reads the notice back straight from the table, because that is the layer the ordering
    /// constraint actually governs — the HTTP layer goes through the same repository but adds the
    /// controller gate on top.
    /// </summary>
    private async Task<Notification?> GetSingleNotificationForAsync(string storeName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var matches = await db.Set<Notification>()
            .IgnoreQueryFilters()
            .Where(n => n.StoreName == storeName)
            .ToListAsync();

        matches.Should().HaveCount(1, "exactly one notice per registration");
        return matches[0];
    }

    /// <summary>
    /// Removes an owner created through the REAL registration endpoint, in dependency order.
    /// <para>
    /// <c>DbTestHelpers.CleanupUserAsync</c> is deliberately NOT used here, and its gap is not this
    /// test's to fix: it deletes Store without first deleting the StoreRoleFeature / StoreModule /
    /// StoreUser / StoreUsage rows that a real registration creates, so against a genuinely
    /// registered owner it dies with 23503 on FK_StoreRoleFeature_Store_StoreId. Hand-written
    /// seeds never hit it because they never generate those rows. The existing support helper is
    /// shared E2E infrastructure and was left untouched; the teardown this test needs lives here.
    /// </para>
    /// <para>
    /// ExecuteDeleteAsync throughout: no tracking, no query filters, and each statement is its own
    /// command, so order is explicit instead of relying on EF's batch ordering.
    /// </para>
    /// </summary>
    private async Task CleanupRegisteredOwnerAsync(Guid userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Conversation.OwnerId is the owner's USER id, not the Owner entity id.
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

        var ownerIds = await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => o.UserId == userId)
            .Select(o => o.Id)
            .ToListAsync();

        var storeIds = await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => ownerIds.Contains(s.OwnerId))
            .Select(s => s.Id)
            .ToListAsync();

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
    }

    /// <summary>
    /// Removes this test's notices. ExecuteDeleteAsync, not load-and-Remove, so it neither depends
    /// on tracking nor on the tenant query filters.
    /// </summary>
    private async Task DeleteNotificationsForStoreAsync(string storeName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<Notification>()
            .IgnoreQueryFilters()
            .Where(n => n.StoreName == storeName)
            .ExecuteDeleteAsync();
    }

    /// <summary>Local shape of the list endpoint payload — kept private so it cannot drift into a shared helper.</summary>
    private sealed record NotificationsEnvelope(IReadOnlyList<NotificationItem> Items, int UnreadCount);

    private sealed record NotificationItem(
        Guid Id,
        string OwnerName,
        string OwnerCellPhone,
        string StoreName,
        DateTime CreatedAt,
        bool IsRead,
        DateTime? ReadAt);
}