using Application.Features.Authentication.Commands.Register;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Trimmed after the RegisterService extraction.
/// <para>
/// What MOVED to RegisterService*Tests (and why): every test asserting what gets BUILT — owner
/// arguments, plan loading, module ids, store creation, SelectedStoreId, the Gestor link. The
/// handler does not build those anymore, so asserting them here would have been asserting on a
/// mock it no longer calls.
/// </para>
/// <para>
/// What STAYED: the two things that are genuinely the handler's — the single SaveChanges and the
/// JWT — plus the delegation contract itself, which is new and is what actually ties the two
/// layers together.
/// </para>
/// </summary>
public class RegisterCommandHandlerTests : RegisterCommandHandlerTestFixture
{
    #region Success path

    [Fact]
    public async Task Handle_ShouldReturnSuccess_WhenRegistrationIsSuccessful()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        var result = await handler.Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Errors.Should().BeEmpty();
        result.Data.Should().NotBeNull();
    }

    /// <summary>
    /// Formerly <c>Handle_ShouldReturnSuccess_WhenPlanHasNoModulesButSaveSucceeds</c>. Its two
    /// halves now live at their real owners and both survive: the empty-module-list behavior is
    /// pinned by RegisterAsync_WithDefaultPlanWithoutModules_ShouldCreateStoreWithEmptyModuleList,
    /// and "a committed save yields the success envelope" is the assertion kept here.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnSuccess_WhenSaveSucceeds()
    {
        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        var handler = CreateHandler();
        var command = CreateValidCommand();

        var result = await handler.Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_ShouldGenerateToken_WithCorrectUserCredentials()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        var result = await handler.Handle(command, CancellationToken.None);

        MockJwtProvider.Verify(
            x => x.GenerateToken(TestUserId, command.Login), Times.Once);
        result.Data.AuthToken.Should().Be("mock-jwt-token-for-testing");
    }

    #endregion

    #region SaveChanges — the handler owns the only commit

    [Fact]
    public async Task Handle_ShouldReturnFailure_WhenSaveChangesReturnsZero()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        result.Errors.First().Code.Should().Be("Register.FailedToSave");
    }

    [Fact]
    public async Task Handle_ShouldReturnFailure_WhenSaveChangesFails()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        result.Errors.First().Code.Should().Be("Register.FailedToSave");
    }

    [Fact]
    public async Task Handle_ShouldCallSaveChangesAsync_WithCancellationToken()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        using var cts = new CancellationTokenSource();

        await handler.Handle(command, cts.Token);

        MockUnitOfWork.Verify(
            x => x.SaveChangesAsync(cts.Token), Times.Once);
    }

    /// <summary>
    /// The whole point of the extraction: exactly ONE save, after the service staged everything.
    /// A second commit here would mean a partially-persisted registration.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldSaveExactlyOnce_AfterTheServiceStagedEverything()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        await handler.Handle(command, CancellationToken.None);

        MockUnitOfWork.Verify(
            x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion

    #region Delegation contract

    /// <summary>
    /// The handler must hand the public <c>Code</c> to the service as <c>reSellerLogin</c>. Kept as
    /// <c>Code</c> on the wire so the register API contract does not move — renaming the public
    /// field would break the validator tests and the React form for nothing.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldForwardCode_AsReSellerLogin()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand(code: "gestor123");

        await handler.Handle(command, CancellationToken.None);

        MockRegisterService.Verify(x => x.RegisterAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<string>(), It.IsAny<string?>(),
            "gestor123", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldForwardNullReSellerLogin_WhenCodeIsNull()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand(code: null);

        await handler.Handle(command, CancellationToken.None);

        MockRegisterService.Verify(x => x.RegisterAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(), It.IsAny<string>(), It.IsAny<string?>(),
            null, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// The public registration SYNTHESIZES the owner description from the store name. That
    /// asymmetry is intentional and predates the extraction: the Gestor flow forwards the
    /// description its form collected instead.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldSynthesizeOwnerDescription_FromStoreName()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        await handler.Handle(command, CancellationToken.None);

        MockRegisterService.Verify(x => x.RegisterAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string?>(),
            "New Store",
            "Nombre de la tienda: New Store",
            It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldForwardAllOwnerFields_Unmodified()
    {
        var handler = CreateHandler();
        var command = CreateValidCommand();

        await handler.Handle(command, CancellationToken.None);

        MockRegisterService.Verify(x => x.RegisterAsync(
            "newuser", "SecurePassword123!", "New User", "+1234567890",
            "newuser@example.com", "New Store",
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion
}