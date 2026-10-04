using Application.Features.Authentication.Commands.Register;
using Application.Services.Messages;
using Domain.Entities.Owners;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Pins WHERE the welcome greeting is written in <see cref="RegisterCommandHandler"/> — after the
/// single commit, and only for an OwnerAdmin principal.
/// </summary>
/// <remarks>
/// The ordering is not cosmetic. <c>IRegisterService.RegisterAsync</c> stages entities and never
/// saves, while every <c>IMessageRepository</c> write commits internally. A greeting issued BEFORE
/// the handler's save would flush its own commit first, leave nothing staged, and make that save
/// return 0 — failing EVERY registration with <c>Register.FailedToSave</c> (HTTP 500).
/// </remarks>
public class RegisterCommandHandlerWelcomeMessageTests : RegisterCommandHandlerTestFixture
{
    private void MakeTestPrincipalAnOwnerAdmin()
    {
        // CreateOwnerService.cs:47-51 is what a real registration leaves behind: Guest=false and the
        // new store selected on the user's session.
        TestUser.SelectedStoreId = TestStoreId;
    }

    [Fact]
    public async Task Handle_sends_the_welcome_message_to_an_owner_admin_registration()
    {
        MakeTestPrincipalAnOwnerAdmin();
        var handler = CreateHandler();

        await handler.Handle(CreateValidCommand(), CancellationToken.None);

        MockOwnerWelcomeMessageService.Verify(x => x.SendAsync(
            TestUserId,                       // the owner's USER id
            TestUser.FullName,                // the owner's User.FullName
            TestStoreId,                      // the store the conversation is scoped to
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_sends_the_welcome_message_AFTER_the_single_save()
    {
        MakeTestPrincipalAnOwnerAdmin();
        var order = new List<string>();
        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Callback<CancellationToken>(_ => order.Add("save"))
            .ReturnsAsync(1);
        MockOwnerWelcomeMessageService
            .Setup(x => x.SendAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, string, Guid, CancellationToken>((_, _, _, _) => order.Add("welcome"))
            .Returns(Task.CompletedTask);
        var handler = CreateHandler();

        await handler.Handle(CreateValidCommand(), CancellationToken.None);

        order.Should().Equal(new[] { "save", "welcome" },
            "greeting before the commit would make the handler's save return 0 and fail the registration");
    }

    [Fact]
    public async Task Handle_does_not_send_the_welcome_message_for_a_non_owner_admin_principal()
    {
        // Guest=true is the Owner entity default (Owner.cs:14) and is what any principal that is NOT
        // an OwnerAdmin carries. A Gestor is a chat non-participant: greeting one would open a
        // conversation nobody reads.
        TestOwner.Guest = true;
        TestUser.SelectedStoreId = TestStoreId;
        var handler = CreateHandler();

        await handler.Handle(CreateValidCommand(), CancellationToken.None);

        MockOwnerWelcomeMessageService.Verify(
            x => x.SendAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_skips_the_welcome_message_when_the_principal_has_no_selected_store()
    {
        // Defensive: the conversation is unique on (OwnerId, StoreId) and has nowhere to live.
        TestUser.SelectedStoreId = Guid.Empty;
        var handler = CreateHandler();

        var result = await handler.Handle(CreateValidCommand(), CancellationToken.None);

        result.Succeeded.Should().BeTrue("a missing greeting target must never change the response");
        MockOwnerWelcomeMessageService.Verify(
            x => x.SendAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_skips_the_welcome_message_when_the_save_reports_no_changes()
    {
        MakeTestPrincipalAnOwnerAdmin();
        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        var handler = CreateHandler();

        var result = await handler.Handle(CreateValidCommand(), CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.Code == "Register.FailedToSave");
        result.ActionCode.Should().Be(500);
        MockOwnerWelcomeMessageService.Verify(
            x => x.SendAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "a greeting addressed to an owner whose row was never committed would be a dangling message");
    }

    [Fact]
    public async Task Handle_returns_success_even_when_the_real_welcome_service_fails_to_write()
    {
        // End-to-end through the REAL service (not a mock that throws): the greeting runs after the
        // response is already being built, so a failing message write must leave a successful
        // registration successful. This is the invariant that keeps a courtesy message from turning
        // every signup into a 500.
        MakeTestPrincipalAnOwnerAdmin();
        var messageRepository = new Mock<Domain.Interfaces.Repositories.IMessageRepository>();
        messageRepository
            .Setup(x => x.AddMessageAsync(It.IsAny<Domain.Entities.Messages.Message>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("boom"));
        var realService = new OwnerWelcomeMessageService(
            messageRepository.Object,
            new Mock<Microsoft.Extensions.Logging.ILogger<OwnerWelcomeMessageService>>().Object);
        var handler = new RegisterCommandHandler(
            MockUnitOfWork.Object,
            MockRegisterService.Object,
            MockJwtProvider.Object,
            MockAuthTokenConfig.Object,
            realService,
            MockOwnerRegistrationNotificationService.Object);

        var result = await handler.Handle(CreateValidCommand(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        messageRepository.Verify(
            x => x.AddMessageAsync(It.IsAny<Domain.Entities.Messages.Message>(), It.IsAny<CancellationToken>()),
            Times.Once, "the greeting was genuinely attempted");
    }

    [Fact]
    public async Task Handle_does_not_send_the_welcome_message_when_the_service_fails()
    {
        MakeTestPrincipalAnOwnerAdmin();
        SetupServiceFailure("Register.PlanLoadFailed", System.Net.HttpStatusCode.InternalServerError);
        var handler = CreateHandler();

        await handler.Handle(CreateValidCommand(), CancellationToken.None);

        MockOwnerWelcomeMessageService.Verify(
            x => x.SendAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public void The_greeting_is_the_decided_text()
    {
        // Keeps the handler and the service on one wording: the handler passes the raw full name and
        // the service renders it, so there is exactly one template in the system.
        OwnerWelcomeMessage.Render(TestUser.FullName).Should().Contain(TestUser.FullName);
    }
}
