using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
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
/// An owner's reply must reach the SuperAdmin's own thread.
/// <para>
/// ADD-ONLY: this is a new spec file. No existing E2E test is modified. It exists because the
/// defect it pins was invisible to every existing test: they seeded the owner in the DEFAULT
/// tenant (so the tenant query filter never hid the platform admin) and asserted only the HTTP
/// status of the send, never the CONTENT the SuperAdmin reads back. A self-registered owner is
/// the real shape — its own tenant — and that is the shape reproduced here.
/// </para>
/// <para>
/// Both halves of the regression are pinned independently, so a future change cannot satisfy one
/// and silently break the other: (1) the stored message is addressed to the platform SuperAdmin,
/// never <see cref="Guid.Empty"/>; (2) the SuperAdmin actually reads the reply back through the
/// messages endpoint.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnerMessageReachesSuperAdminTests
{
    private readonly AppTestFactory _factory;

    public OwnerMessageReachesSuperAdminTests(WebAppFixture fixture) => _factory = fixture.Factory;

    /// <summary>Mirrors the JSON contract of Application.Features.Messages.Queries.GetMessages.MessageDto.</summary>
    private sealed record MessageRow(
        Guid Id,
        Guid ConversationId,
        Guid SenderId,
        MessageSenderType SenderType,
        Guid RecipientId,
        Guid StoreId,
        string Content,
        DateTime SentAt,
        DateTime? ReadAt);

    [Fact]
    public async Task A_registered_owners_reply_is_addressed_to_the_platform_super_admin_and_visible_in_its_thread()
    {
        var login = $"ownermsg-{Guid.NewGuid():N}@test.com";
        var storeName = $"OwnerMsg-{Guid.NewGuid():N}";

        // A REAL registration: this is what puts the owner in a tenant of its own.
        var registration = await _factory.CreateClient().PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = "Owner Msg",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = storeName,
            Code = (string?)null
        });
        registration.StatusCode.Should().Be(HttpStatusCode.Created);

        Guid? tenantId = null;
        try
        {
            var ownerUser = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            ownerUser.Should().NotBeNull();
            tenantId = ownerUser!.TenantId;

            Guid storeId;
            Guid conversationId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                // Precondition, stated as an assertion: the owner lives OUTSIDE the platform
                // admin's tenant. Without this the test could not distinguish the fix from the
                // bug — a default-tenant owner is visible to the unfiltered-by-accident lookup.
                ownerUser.TenantId.Should().NotBe(DataUtils.DefaultTenant.Id,
                    "precondition: a self-registered owner gets a tenant of its own");

                var store = await db.Set<Store>().IgnoreQueryFilters()
                    .SingleAsync(s => s.TenantId == ownerUser.TenantId);
                storeId = store.Id;

                // Conversation.OwnerId is the owner's USER id, never the Owner entity id.
                var conversation = await db.Set<Conversation>().IgnoreQueryFilters()
                    .SingleAsync(c => c.OwnerId == ownerUser.Id && c.StoreId == store.Id);
                conversationId = conversation.Id;
            }

            const string reply = "Hola, necesito ayuda con mi tienda";

            // The owner answers through the real endpoint, from its own tenant.
            var ownerClient = DbTestHelpers.AuthedClient(_factory, ownerUser.Id, login);
            var sent = await ownerClient.PostAsJsonAsync("/api/v1/Messages", new
            {
                ConversationId = conversationId,
                OwnerId = ownerUser.Id,
                StoreId = storeId,
                Content = reply
            });
            sent.StatusCode.Should().Be(HttpStatusCode.OK);

            // (1) ADDRESSING. The old lookup matched Role.Name == "SuperAdmin" — the enum KEY —
            // while a Role.Name is its DISPLAY name ("Super Administrador"), and it ran inside the
            // owner's tenant through a query filter that hides the platform admin (default
            // tenant). It therefore returned Guid.Empty and stamped every owner message with it.
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var stored = await db.Set<Message>().IgnoreQueryFilters()
                    .SingleAsync(m => m.ConversationId == conversationId && m.Content == reply);

                stored.RecipientId.Should().Be(DataUtils.SuperAdminUser.Id,
                    "an owner message must be addressed to the platform SuperAdmin, never Guid.Empty");
                stored.SenderId.Should().Be(ownerUser.Id);
                stored.SenderType.Should().Be(MessageSenderType.Owner);
            }

            // (2) THE THREAD. The SuperAdmin's read filters on RecipientId == its own id, so the
            // wrong stamp is exactly what made the reply invisible in the panel while the
            // conversation and its preview still showed up on the left.
            var adminClient = DbTestHelpers.AuthedClient(_factory, DataUtils.SuperAdminUser.Id, "admin");
            var read = await adminClient.GetAsync($"/api/v1/Messages/conversations/{conversationId}/messages");
            read.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await read.Content.ReadFromJsonAsync<ApiResponse<List<MessageRow>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.Should().Contain(
                m => m.SenderId == ownerUser.Id && m.RecipientId == DataUtils.SuperAdminUser.Id && m.Content == reply,
                "the SuperAdmin must read the owner's reply in the conversation thread");

            // The unread badge counts the same predicate, so it must move too — the count is how
            // the SuperAdmin notices an unanswered owner at all.
            var conversations = await adminClient.GetAsync("/api/v1/Messages/conversations");
            conversations.StatusCode.Should().Be(HttpStatusCode.OK);
            var conversationsBody = await conversations.Content
                .ReadFromJsonAsync<ApiResponse<List<ConversationRow>>>(ApiResponse.Json);
            conversationsBody!.Data!.Single(c => c.Id == conversationId).UnreadCount
                .Should().Be(1, "the owner's unanswered reply is one unread message for the SuperAdmin");
        }
        finally
        {
            if (tenantId is Guid id && id != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, id);
        }
    }

    /// <summary>Mirrors the JSON contract of Application.Features.Messages.Queries.GetConversations.ConversationDto.</summary>
    private sealed record ConversationRow(
        Guid Id,
        Guid OwnerId,
        Guid StoreId,
        DateTime LastMessageAt,
        string? LastMessageContent,
        int UnreadCount);
}
