using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Application.Services.Messages;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Messages;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Messages;

/// <summary>
/// A freshly registered owner is greeted in their own chat conversation.
/// <para>
/// ADD-ONLY: this is a new spec file. No existing E2E test is modified. It exists because the
/// greeting is written AFTER the registration commits, through a repository that commits on its own
/// — an ordering no unit test can prove against a real database.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnerWelcomeMessageRegistrationTests
{
    private const string OwnerFullName = "Ana Martínez";

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public OwnerWelcomeMessageRegistrationTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Self_registration_leaves_the_welcome_message_in_the_new_owners_conversation()
    {
        var login = $"welcome-{Guid.NewGuid():N}@test.com";
        var storeName = $"Welcome-{Guid.NewGuid():N}";

        var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = OwnerFullName,
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = storeName,
            Code = (string?)null
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created,
            "the greeting must never be able to fail a registration");

        Guid? tenantId = null;
        try
        {
            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            user.Should().NotBeNull();
            tenantId = user!.TenantId;

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters()
                .SingleAsync(s => s.TenantId == user.TenantId);

            // Conversation.OwnerId is the owner's USER id, never the Owner entity id.
            var owner = await db.Set<Owner>().IgnoreQueryFilters()
                .SingleAsync(o => o.UserId == user.Id);
            owner.Id.Should().NotBe(user.Id, "pins that the two ids are genuinely different values here");

            var conversation = await db.Set<Conversation>().IgnoreQueryFilters()
                .SingleOrDefaultAsync(c => c.OwnerId == user.Id && c.StoreId == store.Id);
            conversation.Should().NotBeNull("the greeting has to open the conversation it lives in");

            var message = await db.Set<Message>().IgnoreQueryFilters()
                .SingleOrDefaultAsync(m => m.ConversationId == conversation!.Id);
            message.Should().NotBeNull();

            message!.SenderId.Should().Be(DataUtils.SuperAdminUser.Id,
                "the platform sender is the known SuperAdmin constant, not an unordered lookup");
            message.SenderType.Should().Be(MessageSenderType.SuperAdmin);
            message.RecipientId.Should().Be(user.Id);
            message.StoreId.Should().Be(store.Id);
            message.Content.Should().Be(OwnerWelcomeMessage.Render(OwnerFullName));
            message.Content.Should().StartWith($"¡Hola, {OwnerFullName}! 👋");
            message.Content.Should().EndWith("¡Mucho éxito!");
            message.ReadAt.Should().BeNull("an unread greeting is what makes the owner open the chat");

            // Both existing write paths call UpdateLastMessage; without it the conversation keeps a
            // stale preview and sorts to the bottom of the inbox.
            conversation!.LastMessageContent.Should().Be(message.Content);
            conversation.LastMessageAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(5));
        }
        finally
        {
            if (tenantId is Guid id && id != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, id);
        }
    }
}
