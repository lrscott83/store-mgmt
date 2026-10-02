using Application.Abstractions.Messaging;
using Application.Services.Messages;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Messages;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Application.Tests.Services.Messages;

/// <summary>
/// Covers the write performed when an owner is registered: get-or-create the conversation, post the
/// greeting as the platform SuperAdmin, and never let a courtesy message escape as an exception.
/// </summary>
public class OwnerWelcomeMessageServiceTests
{
    private readonly Mock<IMessageRepository> _repository = new();
    private readonly Mock<ILogger<OwnerWelcomeMessageService>> _logger = new();

    private readonly Guid _ownerUserId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();
    private const string OwnerFullName = "Ana Martínez";

    /// <summary>The message handed to <c>AddMessageAsync</c>, captured once the call completes.</summary>
    private Message? _addedMessage;

    /// <summary>The conversation handed to <c>AddConversationAsync</c>, captured once the call completes.</summary>
    private Conversation? _addedConversation;

    private OwnerWelcomeMessageService CreateService()
    {
        _repository
            .Setup(x => x.AddMessageAsync(It.IsAny<Message>(), It.IsAny<CancellationToken>()))
            .Callback<Message, CancellationToken>((m, _) => _addedMessage = m)
            .Returns(Task.CompletedTask);

        _repository
            .Setup(x => x.AddConversationAsync(It.IsAny<Conversation>(), It.IsAny<CancellationToken>()))
            .Callback<Conversation, CancellationToken>((c, _) => _addedConversation = c)
            .Returns(Task.CompletedTask);

        return new OwnerWelcomeMessageService(_repository.Object, _logger.Object);
    }

    private Conversation SetupExistingConversation()
    {
        var conversation = Conversation.Create(_ownerUserId, _storeId);
        _repository
            .Setup(x => x.GetConversationByOwnerAndStoreAsync(_ownerUserId, _storeId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(conversation);
        return conversation;
    }

    private void SetupNoConversation()
    {
        _repository
            .Setup(x => x.GetConversationByOwnerAndStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Conversation?)null);
    }

    [Fact]
    public async Task SendAsync_creates_the_conversation_when_none_exists()
    {
        SetupNoConversation();

        await CreateService().SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        _addedConversation.Should().NotBeNull();
        _addedConversation!.OwnerId.Should().Be(_ownerUserId,
            "Conversation.OwnerId is the owner's USER id, never the Owner entity id");
        _addedConversation.StoreId.Should().Be(_storeId);
        _addedMessage!.ConversationId.Should().Be(_addedConversation.Id);
        _repository.Verify(
            x => x.GetConversationByOwnerAndStoreAsync(_ownerUserId, _storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SendAsync_reuses_the_existing_conversation_instead_of_inserting_a_second_one()
    {
        // There is a UNIQUE index on (OwnerId, StoreId) — a blind insert here would raise a unique
        // violation the second time the same owner+store pair is greeted.
        Conversation existing = SetupExistingConversation();

        await CreateService().SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        _repository.Verify(x => x.AddConversationAsync(It.IsAny<Conversation>(), It.IsAny<CancellationToken>()), Times.Never);
        _addedMessage.Should().NotBeNull();
        _addedMessage!.ConversationId.Should().Be(existing.Id);
    }

    [Fact]
    public async Task SendAsync_sends_the_message_as_the_constant_super_admin_sender()
    {
        SetupExistingConversation();

        await CreateService().SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        _addedMessage.Should().NotBeNull();
        _addedMessage!.SenderId.Should().Be(DataUtils.SuperAdminUser.Id,
            "the platform sender is a known constant; GetSuperAdminIdAsync is unordered and can return Guid.Empty");
        _addedMessage.SenderType.Should().Be(MessageSenderType.SuperAdmin);
        _addedMessage.RecipientId.Should().Be(_ownerUserId, "Message.RecipientId is the owner's USER id");
        _addedMessage.StoreId.Should().Be(_storeId);
    }

    [Fact]
    public async Task SendAsync_renders_the_owner_full_name_in_the_greeting()
    {
        SetupExistingConversation();

        await CreateService().SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        _addedMessage.Should().NotBeNull();
        _addedMessage!.Content.Should().Be(OwnerWelcomeMessage.Render(OwnerFullName));
        _addedMessage.Content.Should().StartWith($"¡Hola, {OwnerFullName}! 👋");
        _addedMessage.Content.Should().Contain("Te damos la bienvenida.");
        _addedMessage.Content.Should().EndWith("¡Mucho éxito!");
        _addedMessage.Content.Should().NotContain("{0}", "the template placeholder must be interpolated away");
        _addedMessage.Content.Split('\n').Should().HaveCount(4, "the decided greeting is four lines");
    }

    [Fact]
    public async Task SendAsync_updates_the_conversation_last_message_after_inserting()
    {
        // Both existing write paths call UpdateLastMessage + UpdateConversationAsync; skipping it
        // leaves a stale preview and pins the conversation at the bottom of the ordering.
        Conversation existing = SetupExistingConversation();
        existing.UpdateLastMessage("stale preview from an older message");

        await CreateService().SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        existing.LastMessageContent.Should().Be(OwnerWelcomeMessage.Render(OwnerFullName));
        existing.LastMessageAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
        _repository.Verify(x => x.UpdateConversationAsync(existing, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SendAsync_inserts_the_message_before_touching_the_conversation()
    {
        // The service is wired directly here rather than through CreateService(), whose capture
        // setups would shadow the ordering callbacks.
        SetupExistingConversation();
        var order = new List<string>();
        _repository
            .Setup(x => x.AddMessageAsync(It.IsAny<Message>(), It.IsAny<CancellationToken>()))
            .Callback<Message, CancellationToken>((_, _) => order.Add("message"))
            .Returns(Task.CompletedTask);
        _repository
            .Setup(x => x.UpdateConversationAsync(It.IsAny<Conversation>(), It.IsAny<CancellationToken>()))
            .Callback<Conversation, CancellationToken>((_, _) => order.Add("conversation"))
            .Returns(Task.CompletedTask);
        var service = new OwnerWelcomeMessageService(_repository.Object, _logger.Object);

        await service.SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        order.Should().Equal(new[] { "message", "conversation" });
    }

    [Fact]
    public async Task SendAsync_does_not_throw_when_the_repository_fails()
    {
        // The greeting runs after the registration was already committed and its response is
        // already being built: a courtesy message must never turn a successful signup into a 500.
        SetupExistingConversation();
        OwnerWelcomeMessageService service = CreateService();
        _repository
            .Setup(x => x.AddMessageAsync(It.IsAny<Message>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("database is on fire"));

        Func<Task> act = () => service.SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task SendAsync_does_not_throw_when_the_conversation_lookup_fails()
    {
        _repository
            .Setup(x => x.GetConversationByOwnerAndStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("lookup exploded"));
        OwnerWelcomeMessageService service = CreateService();

        Func<Task> act = () => service.SendAsync(_ownerUserId, OwnerFullName, _storeId, CancellationToken.None);

        await act.Should().NotThrowAsync();
    }

    [Theory]
    [InlineData("00000000-0000-0000-0000-000000000000", "11111111-1111-1111-1111-111111111111", "Ana")] // no owner user id
    [InlineData("11111111-1111-1111-1111-111111111111", "00000000-0000-0000-0000-000000000000", "Ana")] // no store
    [InlineData("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "   ")] // no name
    public async Task SendAsync_writes_nothing_when_the_target_is_incomplete(
        string ownerUserId, string storeId, string fullName)
    {
        OwnerWelcomeMessageService service = CreateService();

        Func<Task> act = () => service.SendAsync(Guid.Parse(ownerUserId), fullName, Guid.Parse(storeId), CancellationToken.None);

        await act.Should().NotThrowAsync();
        _repository.Verify(x => x.GetConversationByOwnerAndStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        _repository.Verify(x => x.AddConversationAsync(It.IsAny<Conversation>(), It.IsAny<CancellationToken>()), Times.Never);
        _repository.Verify(x => x.AddMessageAsync(It.IsAny<Message>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}

/// <summary>
/// The gate and the target resolution shared by both registration handlers, plus the decided text.
/// </summary>
public class OwnerWelcomeMessageTests
{
    private static Owner OwnerFor(Guid userId, bool guest, string fullName, Guid storeId)
    {
        var tenantId = Guid.NewGuid();
        var user = Domain.Entities.Users.User.Create("login", "hash", fullName, "0000000000", null, tenantId);
        var owner = Domain.Entities.Owners.Owner.Create(userId, guest, tenantId, "desc");
        owner.User = user;
        user.SelectedStoreId = storeId;
        return owner;
    }

    [Fact]
    public void Resolve_targets_an_owner_admin_principal()
    {
        var userId = Guid.NewGuid();
        var storeId = Guid.NewGuid();

        OwnerWelcomeMessage.Resolve(OwnerFor(userId, guest: false, "Ana Martínez", storeId))
            .Should().Be(new OwnerWelcomeMessage.OwnerWelcomeTarget(userId, "Ana Martínez", storeId));
    }

    [Fact]
    public void Resolve_does_not_target_a_non_owner_admin_principal()
    {
        // Guest=true is the Owner entity default and is never assigned to a registered OwnerAdmin
        // (CreateOwnerService.cs:47 passes guest:false unconditionally).
        OwnerWelcomeMessage.ShouldGreet(OwnerFor(Guid.NewGuid(), guest: true, "Ana", Guid.NewGuid()))
            .Should().BeFalse();
        OwnerWelcomeMessage.Resolve(OwnerFor(Guid.NewGuid(), guest: true, "Ana", Guid.NewGuid()))
            .Should().BeNull();
    }

    [Fact]
    public void Resolve_does_not_target_a_null_owner()
    {
        OwnerWelcomeMessage.Resolve(null).Should().BeNull();
    }

    [Fact]
    public void Resolve_does_not_target_an_owner_without_a_user_id()
    {
        OwnerWelcomeMessage.Resolve(OwnerFor(Guid.Empty, guest: false, "Ana", Guid.NewGuid()))
            .Should().BeNull();
    }

    [Fact]
    public void Resolve_does_not_target_an_owner_without_a_selected_store()
    {
        OwnerWelcomeMessage.Resolve(OwnerFor(Guid.NewGuid(), guest: false, "Ana", Guid.Empty))
            .Should().BeNull("the conversation is unique on (OwnerId, StoreId) and has nowhere to live without a store");
    }

    [Fact]
    public void Resolve_does_not_target_an_owner_without_a_name()
    {
        OwnerWelcomeMessage.Resolve(OwnerFor(Guid.NewGuid(), guest: false, "   ", Guid.NewGuid()))
            .Should().BeNull();
    }

    [Fact]
    public void Resolve_does_not_target_an_owner_without_a_user_navigation()
    {
        var owner = Domain.Entities.Owners.Owner.Create(Guid.NewGuid(), false, Guid.NewGuid(), "desc");
        owner.User = null!;

        OwnerWelcomeMessage.ShouldGreet(owner).Should().BeFalse();
        OwnerWelcomeMessage.Resolve(owner).Should().BeNull();
    }

    [Fact]
    public void Render_keeps_the_decided_text_verbatim()
    {
        OwnerWelcomeMessage.Render("Ana").Should().Be(
            "¡Hola, Ana! 👋\n" +
            "Te damos la bienvenida. Tu tienda ya está lista y puedes empezar a vender desde el primer momento.\n" +
            "Estamos aquí para ayudarte a hacer crecer tu negocio. Si te surge cualquier duda o quieres dejarnos una sugerencia, escríbenos por aquí con todo el gusto.\n" +
            "¡Mucho éxito!");
    }

    [Fact]
    public void Render_fits_the_content_column()
    {
        // MessageEntityTypeConfiguration caps Content at 4000 characters.
        OwnerWelcomeMessage.Render("Ana Martínez").Length.Should().BeLessThan(4000);
    }

    [Fact]
    public void Service_implements_the_abstraction_the_handlers_depend_on()
    {
        typeof(IOwnerWelcomeMessageService).IsAssignableFrom(typeof(OwnerWelcomeMessageService))
            .Should().BeTrue("both handlers take the abstraction so the write can be substituted in tests");
    }
}
