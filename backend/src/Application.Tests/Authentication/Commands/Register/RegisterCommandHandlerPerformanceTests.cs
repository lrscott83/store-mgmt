using Application.Abstractions.Authentication;
using Application.Dtos.Authentication;
using Application.Features.Authentication.Commands.Login;
using Application.Features.Authentication.Commands.Register;
using Application.ResponseModels;
using FluentAssertions;
using Moq;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Tests to verify that RegisterCommandHandler uses IJwtProvider directly for token generation.
/// This is a performance optimization - there's no need to re-authenticate after registration.
/// The handler should generate the JWT token directly using IJwtProvider.
/// </summary>
public class RegisterCommandHandlerPerformanceTests : RegisterCommandHandlerTestFixture
{
    #region Performance Tests - Should use IJwtProvider

    /// <summary>
    /// TEST: This test verifies that RegisterCommandHandler uses IJwtProvider.GenerateToken
    /// directly instead of calling ISender.Send with LoginCommand.
    /// 
    /// Performance optimization: After successful registration, the handler should:
    /// 1. Generate the JWT token directly using IJwtProvider
    /// 2. Return the token immediately
    /// 
    /// Instead of the old anti-pattern:
    /// 1. Saving changes
    /// 2. Sending a LoginCommand through MediatR
    /// 3. Waiting for the login handler to re-validate credentials
    /// 4. Generate the JWT token
    /// 5. Return
    /// </summary>
    [Fact]
    public async Task Handle_ShouldCallIJwtProviderGenerateToken_Directly()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert - The handler should call IJwtProvider.GenerateToken directly
        MockJwtProvider.Verify(
            x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()),
            Times.Once,
            "RegisterCommandHandler should call IJwtProvider.GenerateToken directly for performance.");
    }

    /// <summary>
    /// TEST: This test verifies that the handler uses the correct user ID for token generation.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldGenerateTokenWithCorrectUserId()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert - The handler should generate token with the owner's user ID
        MockJwtProvider.Verify(
            x => x.GenerateToken(TestUserId, command.Login),
            Times.Once,
            $"RegisterCommandHandler should generate token with correct user ID ({TestUserId}) and login ({command.Login}).");
    }

    #endregion

    #region Token Generation Tests

    [Fact]
    public async Task Handle_ShouldReturnSuccess_WithValidAuthDto()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Login.Should().Be(command.Login);
        result.Data.AuthToken.Should().Be("mock-jwt-token-for-testing");
        result.Data.ExpiresIn.Should().BeAfter(DateTime.UtcNow);
    }

    [Fact]
    public async Task Handle_ShouldGenerateTokenOnSuccess_NotOnFailure()
    {
        // Arrange - Setup SaveChanges to fail
        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0); // Fail

        var handler = CreateHandler();
        var command = CreateValidCommand();

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert - Token should NOT be generated on failure
        result.Succeeded.Should().BeFalse();
        MockJwtProvider.Verify(
            x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()),
            Times.Never,
            "Token should not be generated when registration fails.");
    }

    #endregion
}
