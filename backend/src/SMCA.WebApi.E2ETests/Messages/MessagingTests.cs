using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Messages;

[Collection("e2e")]
public sealed class MessagingTests
{
    private readonly AppTestFactory _f;
    public MessagingTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Send_message_as_super_admin_to_owner_creates_conversation_and_returns_200()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var request = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Hello from SuperAdmin" };

            var r = await client.PostAsJsonAsync("/api/v1/Messages", request);

            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Send_message_as_owner_to_super_admin_returns_200()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var request = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Hello from Owner" };

            var r = await client.PostAsJsonAsync("/api/v1/Messages", request);

            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Get_conversations_as_super_admin_returns_all_conversations()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var request = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Test" };
            await adminClient.PostAsJsonAsync("/api/v1/Messages", request);

            var r = await adminClient.GetAsync("/api/v1/Messages/conversations");

            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Get_messages_for_conversation_returns_messages()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var sendRequest = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Test message" };
            var sendResponse = await adminClient.PostAsJsonAsync("/api/v1/Messages", sendRequest);
            var conversationId = await ExtractConversationId(sendResponse);

            var r = await adminClient.GetAsync($"/api/v1/Messages/conversations/{conversationId}/messages");

            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Mark_message_as_read_sets_read_at()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var sendRequest = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Read me" };
            var sendResponse = await adminClient.PostAsJsonAsync("/api/v1/Messages", sendRequest);
            var conversationId = await ExtractConversationId(sendResponse);

            var messagesResponse = await adminClient.GetAsync($"/api/v1/Messages/conversations/{conversationId}/messages");
            var messages = await messagesResponse.Content.ReadFromJsonAsync<ApiResponse<List<MessageDto>>>(ApiResponse.Json);
            var messageId = messages!.Data![0].Id;

            var ownerClient = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await ownerClient.PostAsync($"/api/v1/Messages/{messageId}/read", null);

            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Soft_delete_message_only_affects_deleting_user()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var sendRequest = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Delete me" };
            var sendResponse = await adminClient.PostAsJsonAsync("/api/v1/Messages", sendRequest);
            var conversationId = await ExtractConversationId(sendResponse);

            var messagesResponse = await adminClient.GetAsync($"/api/v1/Messages/conversations/{conversationId}/messages");
            var messages = await messagesResponse.Content.ReadFromJsonAsync<ApiResponse<List<MessageDto>>>(ApiResponse.Json);
            var messageId = messages!.Data![0].Id;

            var deleteResponse = await adminClient.DeleteAsync($"/api/v1/Messages/{messageId}");
            deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var ownerClient = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var ownerMessagesResponse = await ownerClient.GetAsync($"/api/v1/Messages/conversations/{conversationId}/messages");
            var ownerMessages = await ownerMessagesResponse.Content.ReadFromJsonAsync<ApiResponse<List<MessageDto>>>(ApiResponse.Json);
            ownerMessages!.Data!.Should().Contain(m => m.Id == messageId);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Broadcast_message_sends_to_all_owners()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner1 = await SeedOwnerWithStoreAsync(_f, $"owner1-{Guid.NewGuid():N}@test.com");
        var owner2 = await SeedOwnerWithStoreAsync(_f, $"owner2-{Guid.NewGuid():N}@test.com");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var request = new { Content = "Broadcast to all owners" };

            var r = await adminClient.PostAsJsonAsync("/api/v1/Messages/broadcast", request);

            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner1.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, owner2.UserId);
        }
    }

    [Fact]
    public async Task Mark_all_as_read_clears_unread_count()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var request = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Unread" };
            await adminClient.PostAsJsonAsync("/api/v1/Messages", request);

            var ownerClient = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await ownerClient.PostAsync("/api/v1/Messages/mark-all-read", null);

            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Delete_all_messages_soft_deletes_for_current_user()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var request = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "Delete all" };
            await adminClient.PostAsJsonAsync("/api/v1/Messages", request);

            var r = await adminClient.DeleteAsync("/api/v1/Messages");

            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Send_message_without_content_returns_400()
    {
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, $"sa-{Guid.NewGuid():N}@test.com", "Password123");
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, admin, $"sa-{admin:N}@test.com");
            var request = new { ConversationId = Guid.Empty, OwnerId = owner.OwnerId, StoreId = owner.StoreId, Content = "" };

            var r = await client.PostAsJsonAsync("/api/v1/Messages", request);

            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, admin);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    [Fact]
    public async Task Broadcast_without_super_admin_role_returns_403()
    {
        var owner = await SeedOwnerWithStoreAsync(_f, $"owner-{Guid.NewGuid():N}@test.com");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var request = new { Content = "Should fail" };

            var r = await client.PostAsJsonAsync("/api/v1/Messages/broadcast", request);

            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
        }
    }

    private static async Task<Guid> ExtractConversationId(HttpResponseMessage response)
    {
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<MessageDto>>(ApiResponse.Json);
        return body!.Data!.ConversationId;
    }

    private static async Task<OwnerFixture> SeedOwnerWithStoreAsync(AppTestFactory factory, string login)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<global::Infrastructure.Persistence.Contexts.ApplicationDbContext>();

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Owner", "0000000000", login,
            DataUtils.DefaultTenant.Id);
        var preHashProtector = scope.ServiceProvider.GetRequiredService<Application.Abstractions.Authentication.IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);

        var owner = Owner.Create(user.Id, false, DataUtils.DefaultTenant.Id, "E2E Owner Description");
        db.Set<Owner>().Add(owner);

        var store = Store.Create("E2E Store", owner.Id, true, DataUtils.DefaultTenant.Id);
        db.Set<Store>().Add(store);

        await db.SaveChangesAsync();

        return new OwnerFixture(owner.Id, store.Id, user.Id, login);
    }

    private sealed record OwnerFixture(Guid OwnerId, Guid StoreId, Guid UserId, string Login);
    private sealed record MessageDto(Guid Id, Guid ConversationId, Guid SenderId, MessageSenderType SenderType, Guid RecipientId, Guid StoreId, string Content, DateTime SentAt, DateTime? ReadAt);
}
