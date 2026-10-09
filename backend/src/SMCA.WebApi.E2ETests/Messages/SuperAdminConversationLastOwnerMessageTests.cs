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
/// The SuperAdmin inbox must be ordered by what the OWNER last wrote, not by when the
/// thread last moved at all.
/// <para>
/// ADD-ONLY: this is a new spec file. No existing E2E test and no existing E2E support
/// file is modified. It exists because the signal it pins was structurally missing:
/// <see cref="Conversation"/> stores only <c>LastMessageAt</c>/<c>LastMessageContent</c>
/// and no sender, so the inbox could not tell "the owner is waiting" apart from "the admin
/// answered someone" — both move the same field, and the owner answering the reply floats
/// to the top for being answered.
/// </para>
/// <para>
/// Both halves are pinned independently: (1) <c>LastOwnerMessageAt</c> is the owner's own
/// newest message, so the ordering signal really discriminates between two owners; (2) a
/// SuperAdmin reply moves <c>LastMessageAt</c> but leaves <c>LastOwnerMessageAt</c> alone, so
/// the ordering cannot be satisfied by recency of the thread.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class SuperAdminConversationLastOwnerMessageTests
{
    private readonly AppTestFactory _factory;

    public SuperAdminConversationLastOwnerMessageTests(WebAppFixture fixture) => _factory = fixture.Factory;

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
        var login = $"lastowner-{tag}-{Guid.NewGuid():N}@test.com";
        var registration = await _factory.CreateClient().PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = $"Owner {tag}",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = $"LastOwner-{tag}-{Guid.NewGuid():N}",
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
    public async Task Last_owner_message_at_tracks_the_owner_only_and_ignores_a_super_admin_reply()
    {
        var (ownerA, loginA) = await RegisterOwnerAsync("A");
        var (ownerB, loginB) = await RegisterOwnerAsync("B");

        Guid? tenantA = null;
        Guid? tenantB = null;
        try
        {
            tenantA = ownerA.TenantId;
            tenantB = ownerB.TenantId;

            // Each owner writes once, from its own tenant — the real shape.
            // A first so B's message is strictly the newer of the two.
            foreach (var (owner, login, content) in new[]
            {
                (ownerA, loginA, "Mensaje de Ana"),
                (ownerB, loginB, "Mensaje de Bea"),
            })
            {
                var sent = await DbTestHelpers.AuthedClient(_factory, owner.UserId, login)
                    .PostAsJsonAsync("/api/v1/Messages", new
                    {
                        ConversationId = owner.ConversationId,
                        OwnerId = owner.UserId,
                        StoreId = owner.StoreId,
                        Content = content
                    });
                sent.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            // The stored SentAt is the ground truth, not a wall clock: the endpoint
            // reports what the database holds, and the test's own ordering claim is
            // only meaningful if those two agree.
            DateTime ownerAMessageAt;
            DateTime ownerBMessageAt;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                ownerAMessageAt = await db.Set<Message>().IgnoreQueryFilters()
                    .Where(m => m.ConversationId == ownerA.ConversationId)
                    .OrderByDescending(m => m.SentAt)
                    .Select(m => m.SentAt)
                    .FirstAsync();
                ownerBMessageAt = await db.Set<Message>().IgnoreQueryFilters()
                    .Where(m => m.ConversationId == ownerB.ConversationId)
                    .OrderByDescending(m => m.SentAt)
                    .Select(m => m.SentAt)
                    .FirstAsync();
            }
            ownerBMessageAt.Should().BeAfter(ownerAMessageAt,
                "precondition: B wrote strictly after A, so the ordering signal has a winner");

            var adminClient = DbTestHelpers.AuthedClient(_factory, DataUtils.SuperAdminUser.Id, "admin");

            var beforeReply = await ReadConversationsAsync(adminClient);
            var convABefore = beforeReply.Single(c => c.Id == ownerA.ConversationId);
            var convBBefore = beforeReply.Single(c => c.Id == ownerB.ConversationId);

            convABefore.LastOwnerMessageAt.Should().NotBeNull();
            convBBefore.LastOwnerMessageAt.Should().NotBeNull();
            convABefore.LastOwnerMessageAt.Should().Be(ownerAMessageAt,
                "the owner's own newest message is what the inbox orders on");
            convBBefore.LastOwnerMessageAt.Should().Be(ownerBMessageAt);

            // (1) THE SIGNAL DISCRIMINATES. Without this the assertion below could pass
            // against a value that is constant across every conversation.
            convBBefore.LastOwnerMessageAt.Should().BeAfter(convABefore.LastOwnerMessageAt!.Value,
                "B wrote last, so B's owner-recency must sort above A's");

            // (2) THE ADMIN REPLY DOES NOT MOVE IT. This is the regression: LastMessageAt
            // moves for every message including the admin's own, so ordering on it floated
            // the owner being answered to the top of the inbox.
            var reply = await adminClient.PostAsJsonAsync("/api/v1/Messages", new
            {
                ConversationId = ownerA.ConversationId,
                OwnerId = ownerA.UserId,
                StoreId = ownerA.StoreId,
                Content = "Respuesta del administrador"
            });
            reply.StatusCode.Should().Be(HttpStatusCode.OK);

            DateTime adminReplyAt;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                adminReplyAt = await db.Set<Message>().IgnoreQueryFilters()
                    .Where(m => m.ConversationId == ownerA.ConversationId
                             && m.SenderId == DataUtils.SuperAdminUser.Id)
                    .OrderByDescending(m => m.SentAt)
                    .Select(m => m.SentAt)
                    .FirstAsync();
            }

            var afterReply = await ReadConversationsAsync(adminClient);
            var convAAfter = afterReply.Single(c => c.Id == ownerA.ConversationId);

            convAAfter.LastOwnerMessageAt.Should().Be(convABefore.LastOwnerMessageAt,
                "a SuperAdmin reply is not owner activity and must not reorder the owner");
            // Conversation.UpdateLastMessage stamps its OWN DateTime.UtcNow, not the
            // message's SentAt, so this compares instants and not equality: the only
            // claim is that the field MOVED onto the reply.
            convAAfter.LastMessageAt.Should().BeOnOrAfter(adminReplyAt,
                "LastMessageAt does move on the admin reply — that is the field ordering must avoid");
            convAAfter.LastMessageAt.Should().BeAfter(ownerAMessageAt,
                "the conversation now points past the owner's own message");
            convAAfter.LastOwnerMessageAt.Should().BeBefore(convAAfter.LastMessageAt,
                "the two fields now disagree, which is exactly what the ordering signal exists to resolve");
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