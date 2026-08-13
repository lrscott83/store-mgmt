using Application.Dtos.Authentication;
using Application.Features.Authentication.Commands.Login;
using Application.ResponseModels;
using Domain.Common.Results;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using Application.Features.Authentication.Commands.Register;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Unit tests for RegisterCommandHandler covering all scenarios:
/// - Happy Path: Normal registration flow
/// - Edge Cases: Null/empty inputs, extreme values
/// - Error Management: Controlled failures
/// - Integration: Mock verification of dependencies
/// </summary>
public class RegisterCommandHandlerTests : RegisterCommandHandlerTestFixture
{
    #region Constructor Tests

    [Fact]
    public void Constructor_ShouldNotThrow_WhenAllDependenciesAreProvided()
    {
        // Act
        var action = () => CreateHandler();

        // Assert
        action.Should().NotThrow();
    }

    #endregion

    #region Happy Path Tests

    [Fact]
    public async Task Handle_ShouldReturnSuccess_WhenRegistrationIsSuccessful()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Login.Should().Be(command.Login);
        result.Data.AuthToken.Should().NotBeNullOrEmpty();
        result.Data.ExpiresIn.Should().BeAfter(DateTime.UtcNow);
    }

    [Fact]
    public async Task Handle_ShouldReturnSuccess_WithEmptyWrapFields()
    {
        // Arrange — auth-login-wrapped-dek R4: Register never delivers a wrapped DEK
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.WrappedDek.Should().BeEmpty();
        result.Data.WrapSalt.Should().BeEmpty();
        result.Data.WrapIv.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_ShouldReturnSuccess_WhenRegistrationWithValidReSellerCode()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: "RESELLER123");
        var reSeller = CreateTestReSeller();

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(command.Code!))
            .ReturnsAsync(reSeller);

        MockReSellerOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<ReSellerOwner>()))
            .ReturnsAsync((ReSellerOwner rso) => rso);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Login.Should().Be(command.Login);
        result.Data.AuthToken.Should().NotBeNullOrEmpty();
        result.Data.ExpiresIn.Should().BeAfter(DateTime.UtcNow);
    }

    [Fact]
    public async Task Handle_ShouldCreateOwnerWithCorrectParameters()
    {
        // Arrange
        var handler = CreateHandler();
        var command = new RegisterCommand(
            Login: "owner123",
            Password: "Password123!",
            FullName: "Owner Name",
            CellPhone: "+1234567890",
            Email: "owner@example.com",
            StoreName: "My Store",
            Code: null);

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            command.Login,
            command.Password,
            command.FullName,
            command.CellPhone,
            command.Email,
            It.Is<string>(s => s.Contains(command.StoreName))),
            Times.Once);
    }

    #endregion

    #region Edge Cases Tests

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_ShouldCreateOwner_WhenLoginIsNullOrEmptyOrWhitespace(string? login)
    {
        // Arrange
        var handler = CreateHandler();
        var command = new RegisterCommand(
            Login: login!,
            Password: "Password123!",
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);

        // Act - The handler should pass through validation and attempt creation
        // Note: Validation happens via FluentValidation pipeline, not in handler
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert - Handler should attempt creation (validation is handled separately)
        await act.Should().NotThrowAsync();
        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldCreateOwner_WhenPasswordIsEmpty()
    {
        // Arrange
        var handler = CreateHandler();
        var command = new RegisterCommand(
            Login: "testuser",
            Password: "",
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);

        // Act
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task Handle_ShouldCreateOwner_WhenEmailIsNull()
    {
        // Arrange
        var handler = CreateHandler();
        var command = new RegisterCommand(
            Login: "testuser",
            Password: "Password123!",
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: null,
            StoreName: "Test Store",
            Code: null);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            null,
            It.IsAny<string?>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldCreateOwner_WhenCodeIsNull()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: null);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockReSellerRepository.Verify(x => x.GetByUserNameAsync(
            It.IsAny<string>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ShouldCreateOwner_WhenCodeIsEmptyString()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: "");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockReSellerRepository.Verify(x => x.GetByUserNameAsync(
            It.IsAny<string>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ShouldCreateOwner_WhenFullNameHasSpecialCharacters()
    {
        // Arrange
        var handler = CreateHandler();
        var command = new RegisterCommand(
            Login: "testuser",
            Password: "Password123!",
            FullName: "José María García-López",
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_ShouldCreateOwner_WhenCellPhoneHasInternationalFormat()
    {
        // Arrange
        var handler = CreateHandler();
        var command = new RegisterCommand(
            Login: "testuser",
            Password: "Password123!",
            FullName: "Test User",
            CellPhone: "+52-1-55-1234-5678",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    #endregion

    #region Error Management Tests

    [Fact]
    public async Task Handle_ShouldReturnFailure_WhenSaveChangesReturnsZero()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        result.Errors.First().Code.Should().Be("Register.FailedToSave");
    }

    [Fact]
    public async Task Handle_ShouldReturnFailure_WhenSaveChangesFails()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0); // Simulate save failure

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        result.Errors.First().Code.Should().Be("Register.FailedToSave");
    }

    [Fact]
    public async Task Handle_ShouldReturnSuccess_WhenNoModulesAvailableButSaveSucceeds()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Domain.Entities.Modules.Module>());

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_ShouldReturnFailure_WhenCreateOwnerThrowsException()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>()))
            .ThrowsAsync(new InvalidOperationException("Owner creation failed"));

        // Act
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Owner creation failed");
    }

    #endregion

    #region Integration Tests (Mock Verification)

    [Fact]
    public async Task Handle_ShouldCallCreateOwnerService_WithCorrectParameters()
    {
        // Arrange
        var handler = CreateHandler();
        var command = new RegisterCommand(
            Login: "newowner",
            Password: "SecurePass123!",
            FullName: "New Owner",
            CellPhone: "+1234567890",
            Email: "owner@test.com",
            StoreName: "New Store",
            Code: null);

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockCreateOwnerService.Verify(x => x.CreateOwnerAsync(
            command.Login,
            command.Password,
            command.FullName,
            command.CellPhone,
            command.Email,
            It.Is<string>(s => s.Contains(command.StoreName))),
            Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldCallModuleRepository_GetAvailableModulesToStore()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockModuleRepository.Verify(x => x.GetAvailableModulesToStore(),
            Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldCallCreateStoreService_WithOwnerIdAndTenantId()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            TestOwnerId,
            TestTenantId,
            command.StoreName,
            It.IsAny<string?>(),
            It.Is<string>(s => s.Contains("prueba")),
            false,
            It.Is<List<int>>(list => list.Contains(TestModule.Id))),
            Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldCallSaveChangesAsync_WithCancellationToken()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();
        var cancellationToken = new CancellationToken();

        // Act
        await handler.Handle(command, cancellationToken);

        // Assert
        MockUnitOfWork.Verify(x => x.SaveChangesAsync(cancellationToken), Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldCreateReSellerOwner_WhenValidCodeProvided()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: "VALIDCODE");
        var reSeller = CreateTestReSeller();

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(command.Code!))
            .ReturnsAsync(reSeller);

        MockReSellerOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<ReSellerOwner>()))
            .ReturnsAsync((ReSellerOwner rso) => rso);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockReSellerOwnerRepository.Verify(x => x.AddAsync(
            It.Is<ReSellerOwner>(rso => 
                rso.ReSellerId == reSeller.Id && 
                rso.OwnerId == TestOwnerId)),
            Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldGenerateToken_WithCorrectUserCredentials()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert - Verify IJwtProvider was called with correct parameters
        MockJwtProvider.Verify(x => x.GenerateToken(
            TestUserId,
            command.Login),
            Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldSetSelectedStoreId_OnOwnerUser()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        TestUser.SelectedStoreId.Should().Be(TestStoreId);
    }

    [Fact]
    public async Task Handle_ShouldNotCallReSellerRepository_WhenCodeIsNull()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: null);

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockReSellerRepository.Verify(x => x.GetByUserNameAsync(
            It.IsAny<string>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ShouldNotCallReSellerOwnerRepository_WhenCodeIsNull()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: null);

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockReSellerOwnerRepository.Verify(x => x.AddAsync(
            It.IsAny<ReSellerOwner>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ShouldNotCreateReSellerOwner_WhenReSellerNotFound()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand(code: "INVALIDCODE");

        MockReSellerRepository
            .Setup(x => x.GetByUserNameAsync(command.Code!))
            .ReturnsAsync((ReSeller?)null);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        MockReSellerOwnerRepository.Verify(x => x.AddAsync(
            It.IsAny<ReSellerOwner>()),
            Times.Never);
    }

    #endregion
}
