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
/// The NEGATIVE shape of <c>LastOwnerMessageAt</c>: the two states where the SuperAdmin
/// inbox must report <c>null</c> instead of a timestamp.
/// <para>
/// ADD-ONLY: this is a NEW spec file. No existing E2E test and no existing E2E support
/// file is modified. It exists because <see cref="SuperAdminConversationLastOwnerMessageTests"/>
/// only ever pins the value PRESENT, and a value that is always non-null would pass
/// every assertion in it — the nullable contract was therefore untested in the
/// direction that actually distinguishes the field from a plain "last activity".
/// </para>
/// <para>
/// Two ways the answer is legitimately absent, both asserted here:
/// (1) the owner never wrote at all — a freshly registered owner has a conversation
/// created by the platform's welcome message, which is stamped from the SuperAdmin,
/// so the conversation EXISTS with a real <c>LastMessageAt</c> while
/// <c>LastOwnerMessageAt</c> is null; and
/// (2) the owner retracted what they wrote — a message deleted by its own sender is
/// no longer owner activity, so the conversation must fall back to null instead of
/// keeping the withdrawn message's timestamp.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class SuperAdminConversationLastOwnerMessageEdgeTests
{
    private readonly AppTestFactory _factory;

    public SuperAdminConversationLastOwnerMessageEdgeTests(WebAppFixture fixture) => _factory = fixture.Factory;

    /// <summary>
    /// Mirrors the JSON contract of
    /// Application.Features.Messages.Queries.GetConversations.ConversationDto.
    /// </summary>
    private sealed record ConversationRow(
        Guid Id,
        Guid OwnerId,
        Guid StoreId,
        DateTime LastMessageAt,
        string? LastMessageContent,
        int UnreadCount,
        DateTime? LastOwnerMessageAt);

    private sealed record OwnerContext(Guid UserId, Guid TenantId, Guid StoreId, Guid ConversationId);

    private async Task<(OwnerContext Owner, string Login)> RegisterOwnerAsync(string tag)
    {
        var login = $"lastowneredge-{tag}-{Guid.NewGuid():N}@test.com";
        var registration = await _factory.CreateClient().PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = $"Owner {tag}",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = $"LastOwnerEdge-{tag}-{Guid.NewGuid():N}",
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
    public async Task Last_owner_message_at_is_null_when_the_owner_never_wrote_and_after_they_delete_their_own()
    {
        // Ana never writes; Bea writes once and then deletes that very message.
        var (neverWrote, _) = await RegisterOwnerAsync("A");
        var (retracted, retractedLogin) = await RegisterOwnerAsync("B");

        Guid? tenantA = null;
        Guid? tenantB = null;
        try
        {
            tenantA = neverWrote.TenantId;
            tenantB = retracted.TenantId;

            // (1) NEVER WROTE. The welcome message on registration is stamped from the
            // platform SuperAdmin, so the conversation exists and is NOT empty.
            var adminClient = DbTestHelpers.AuthedClient(_factory, DataUtils.SuperAdminUser.Id, "admin");

            var baseline = await ReadConversationsAsync(adminClient);
            var neverWroteRow = baseline.Single(c => c.Id == neverWrote.ConversationId);
            var retractedBefore = baseline.Single(c => c.Id == retracted.ConversationId);

            neverWroteRow.LastMessageAt.Should().NotBe(default,
                "precondition: the platform welcome message gives the conversation real activity, " +
                "so a null owner-recency is about WHO wrote it and not about an empty thread");
            neverWroteRow.LastOwnerMessageAt.Should().BeNull(
                "only the SuperAdmin wrote here, and nothing the admin said makes an owner 'more active'");
            retractedBefore.LastOwnerMessageAt.Should().BeNull(
                "same baseline for Bea before she writes anything");

            // Bea writes: the field must MOVE off null, otherwise the assertion above
            // would be satisfied by a constant null and would prove nothing.
            var sent = await DbTestHelpers.AuthedClient(_factory, retracted.UserId, retractedLogin)
                .PostAsJsonAsync("/api/v1/Messages", new
                {
                    ConversationId = retracted.ConversationId,
                    OwnerId = retracted.UserId,
                    StoreId = retracted.StoreId,
                    Content = "Escribo y luego borro"
                });
            sent.StatusCode.Should().Be(HttpStatusCode.OK);

            Guid messageId;
            DateTime sentAt;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var message = await db.Set<Message>().IgnoreQueryFilters()
                    .Where(m => m.ConversationId == retracted.ConversationId
                             && m.SenderId == retracted.UserId)
                    .OrderByDescending(m => m.SentAt)
                    .FirstAsync();
                messageId = message.Id;
                sentAt = message.SentAt;
            }

            var afterWrite = await ReadConversationsAsync(adminClient);
            afterWrite.Single(c => c.Id == retracted.ConversationId).LastOwnerMessageAt.Should().Be(sentAt,
                "precondition: the field is NOT a constant null — Bea's own message moves it");

            // (2) RETRACTED. A message deleted by its own sender is withdrawn activity:
            // `!IsDeletedBySender` must drop it, leaving Bea with no owner message at all.
            var deleted = await DbTestHelpers.AuthedClient(_factory, retracted.UserId, retractedLogin)
                .DeleteAsync($"/api/v1/Messages/{messageId}");
            deleted.StatusCode.Should().Be(HttpStatusCode.OK);

            var afterDelete = await ReadConversationsAsync(adminClient);
            afterDelete.Single(c => c.Id == retracted.ConversationId).LastOwnerMessageAt.Should().BeNull(
                "a message its sender deleted is not owner activity anymore");

            // Ana is still null after the whole sequence: the field is per conversation,
            // so Bea's write/delete cycle must not bleed into her row.
            afterDelete.Single(c => c.Id == neverWrote.ConversationId).LastOwnerMessageAt.Should().BeNull(
                "the retracted conversation's state must not leak into the one whose owner never wrote");
        }
        finally
        {
            if (tenantA is Guid idA && idA != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, idA);
            if (tenantB is Guid idB && idB != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, idB);
        }
    }
}