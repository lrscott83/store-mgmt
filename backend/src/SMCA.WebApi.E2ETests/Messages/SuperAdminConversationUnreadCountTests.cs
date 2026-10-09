using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Entities.Messages;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Messages;

/// <summary>
/// The BATCHED unread count observed end to end.
/// <para>
/// ADD-ONLY: this is a NEW spec file. No existing E2E test and no existing E2E
/// support file is modified. It exists because the previous candidate replaced the
/// per-conversation <c>GetUnreadCountAsync</c> with <c>GetUnreadCountsAsync</c> (one
/// grouped query for the whole list) but no test in that candidate asserted an
/// unread value at all — the grouped regrouping and the "missing means zero"
/// default would have passed every assertion while being wrong, and the badge the
/// user sees is exactly this number.
/// </para>
/// <para>
/// The sequence pins both halves of the batched contract: the grouped count DECREASES
/// one per read receipt, and a fully read conversation is ABSENT from the grouped
/// result so the caller's default (0) is what the endpoint actually returns.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class SuperAdminConversationUnreadCountTests
{
    private readonly AppTestFactory _factory;

    public SuperAdminConversationUnreadCountTests(WebAppFixture fixture) => _factory = fixture.Factory;

    /// <summary>Mirrors the JSON contract of Application.Features.Messages.Queries.GetConversations.ConversationDto.</summary>
    private sealed record ConversationRow(
        Guid Id,
        Guid OwnerId,
        Guid StoreId,
        DateTime LastMessageAt,
        string? LastMessageContent,
        int UnreadCount,
        DateTime? LastOwnerMessageAt);

    private sealed record OwnerContext(Guid UserId, Guid TenantId, Guid StoreId, Guid ConversationId);

    private async Task<(OwnerContext Owner, string Login)> RegisterOwnerAsync()
    {
        var login = $"unreadbatch-{Guid.NewGuid():N}@test.com";
        var registration = await _factory.CreateClient().PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = "Owner Unread Batch",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = $"UnreadBatch-{Guid.NewGuid():N}",
            Code = (string?)null
        });
        registration.StatusCode.Should().Be(HttpStatusCode.Created);

        var ownerUser = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
        ownerUser.Should().NotBeNull();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var store = await db.Set<Store>().IgnoreQueryFilters()
            .SingleAsync(s => s.TenantId == ownerUser!.TenantId);
        // Conversation.OwnerId is the owner's USER id, never the Owner entity id.
        var conversation = await db.Set<Conversation>().IgnoreQueryFilters()
            .SingleAsync(c => c.OwnerId == ownerUser.Id && c.StoreId == store.Id);

        return (new OwnerContext(ownerUser.Id, ownerUser.TenantId, store.Id, conversation.Id), login);
    }

    private async Task<List<ConversationRow>> ReadConversationsAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/Messages/conversations");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<ConversationRow>>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();
        return body.Data!;
    }

    [Fact]
    public async Task Batched_unread_count_drops_per_read_and_defaults_to_zero_when_fully_read()
    {
        var (owner, login) = await RegisterOwnerAsync();

        Guid? tenant = null;
        try
        {
            tenant = owner.TenantId;

            // The owner writes twice: the batched grouped count must see BOTH.
            var ownerClient = DbTestHelpers.AuthedClient(_factory, owner.UserId, login);
            foreach (var content in new[] { "Mensaje uno", "Mensaje dos" })
            {
                var sent = await ownerClient.PostAsJsonAsync("/api/v1/Messages", new
                {
                    ConversationId = owner.ConversationId,
                    OwnerId = owner.UserId,
                    StoreId = owner.StoreId,
                    Content = content
                });
                sent.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            Guid firstId;
            Guid secondId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var ids = await db.Set<Message>().IgnoreQueryFilters()
                    .Where(m => m.ConversationId == owner.ConversationId && m.SenderId == owner.UserId)
                    .OrderBy(m => m.SentAt)
                    .Select(m => m.Id)
                    .ToListAsync();
                ids.Should().HaveCount(2, "precondition: the owner wrote two messages");
                firstId = ids[0];
                secondId = ids[1];
            }

            var admin = DbTestHelpers.AuthedClient(_factory, DataUtils.SuperAdminUser.Id, "admin");

            // Two unread: the grouped count is the sum for this conversation, not 1.
            var bothUnread = await ReadConversationsAsync(admin);
            bothUnread.Single(c => c.Id == owner.ConversationId).UnreadCount
                .Should().Be(2, "the batched grouped count must see every unread owner message");

            // Read one: the grouped count drops by exactly one.
            var firstRead = await admin.PostAsync($"/api/v1/Messages/{firstId}/read", null);
            firstRead.StatusCode.Should().Be(HttpStatusCode.OK);

            var oneUnread = await ReadConversationsAsync(admin);
            oneUnread.Single(c => c.Id == owner.ConversationId).UnreadCount
                .Should().Be(1, "reading one message must drop the batched count by one");

            // Read the second: the conversation is now ABSENT from the grouped result.
            // The endpoint still lists the conversation, so the value that comes back
            // is the caller's "missing means zero" default — the other half of the
            // batched contract that no test previously observed.
            var secondRead = await admin.PostAsync($"/api/v1/Messages/{secondId}/read", null);
            secondRead.StatusCode.Should().Be(HttpStatusCode.OK);

            var noneUnread = await ReadConversationsAsync(admin);
            noneUnread.Single(c => c.Id == owner.ConversationId).UnreadCount
                .Should().Be(0, "a fully read conversation is absent from the batched result, so the endpoint must default it to zero");
        }
        finally
        {
            if (tenant is Guid id && id != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, id);
        }
    }
}
