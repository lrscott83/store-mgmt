using Application.Abstractions.Authentication;
using Application.Dtos.Authentication;
using Application.Features.Authentication.Commands.Login;
using Application.ResponseModels;
using Domain.Common.Results;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;

namespace Application.Tests.Authentication.Commands.Login;

/// <summary>
/// Tests for LoginCommandHandler covering authentication scenarios.
/// These tests verify that the handler correctly validates credentials
/// and returns appropriate responses.
/// </summary>
public class LoginCommandHandlerTests
{
    private readonly Mock<IAuthenticationService> _mockAuthService;
    private readonly Mock<IJwtProvider> _mockJwtProvider;
    private readonly Mock<IAuthTokenConfig> _mockAuthTokenConfig;
    private readonly Mock<IRefreshTokenRepository> _mockRefreshTokenRepo;
    private readonly Mock<ILogger<LoginCommandHandler>> _mockLogger;
    private readonly LoginCommandHandler _handler;

    public LoginCommandHandlerTests()
    {
        _mockAuthService = new Mock<IAuthenticationService>();
        _mockJwtProvider = new Mock<IJwtProvider>();
        _mockAuthTokenConfig = new Mock<IAuthTokenConfig>();
        _mockRefreshTokenRepo = new Mock<IRefreshTokenRepository>();
        _mockLogger = new Mock<ILogger<LoginCommandHandler>>();

        _mockAuthTokenConfig.Setup(x => x.TokenLifetimeDays).Returns(35);

        var authSettings = new AuthenticationSettings
        {
            TokenLifetimeDays = 35,
            RefreshTokenExpirationDays = 7
        };

        _handler = new LoginCommandHandler(
            _mockAuthService.Object,
            _mockJwtProvider.Object,
            _mockAuthTokenConfig.Object,
            _mockRefreshTokenRepo.Object,
            Options.Create(authSettings),
            _mockLogger.Object);
    }

    #region Invalid Credentials Tests

    [Fact]
    public async Task Handle_WithInvalidCredentials_ShouldReturnFailure()
    {
        // Arrange
        var command = new LoginCommand("testuser", "WrongPassword123!");
        Result<Guid> authResult = Result.Failure<Guid>(new Error("Auth.InvalidCredentials", "Invalid login or password"));

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.InvalidCredentials");
    }

    [Fact]
    public async Task Handle_WithInvalidCredentials_ShouldNotGenerateToken()
    {
        // Arrange
        var command = new LoginCommand("testuser", "WrongPassword123!");
        var authResult = Result.Failure<Guid>(new Error("Auth.InvalidCredentials", "Invalid credentials"));

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        // Act
        await _handler.Handle(command, CancellationToken.None);

        // Assert
        _mockJwtProvider.Verify(
            x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()), 
            Times.Never);
    }

    #endregion

    #region Valid Credentials Tests

    [Fact]
    public async Task Handle_WithValidCredentials_ShouldReturnSuccess()
    {
        // Arrange
        var command = new LoginCommand("testuser", "CorrectPassword123!");
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);
        var expectedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test";

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(userId, command.Login))
            .Returns(expectedToken);

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_WithValidCredentials_ShouldGenerateToken()
    {
        // Arrange
        var command = new LoginCommand("testuser", "CorrectPassword123!");
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);
        var expectedToken = "valid-jwt-token";

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(userId, command.Login))
            .Returns(expectedToken);

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        _mockJwtProvider.Verify(
            x => x.GenerateToken(userId, command.Login), 
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithValidCredentials_ShouldReturnTokenInAuthDto()
    {
        // Arrange
        var command = new LoginCommand("testuser", "CorrectPassword123!");
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);
        var expectedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.signature";

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(userId, command.Login))
            .Returns(expectedToken);

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Data.Should().NotBeNull();
        result.Data!.AuthToken.Should().Be(expectedToken);
        result.Data.Login.Should().Be(command.Login);
    }

    [Fact]
    public async Task Handle_WithValidCredentials_ShouldUseCorrectUserId()
    {
        // Arrange
        var command = new LoginCommand("testuser", "CorrectPassword123!");
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()))
            .Returns("token");

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        await _handler.Handle(command, CancellationToken.None);

        // Assert
        _mockJwtProvider.Verify(
            x => x.GenerateToken(userId, command.Login), 
            Times.Once);
    }

    #endregion

    #region Auth Service Error Tests

    [Fact]
    public async Task Handle_WhenAuthServiceReturnsDefault_ShouldReturnFailure()
    {
        // Arrange
        var command = new LoginCommand("testuser", "Password123!");
        var authResult = Result<Guid>.Success(default(Guid));

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_WhenAuthServiceThrows_ShouldReturnFailure()
    {
        // Arrange
        var command = new LoginCommand("testuser", "Password123!");
        
        _mockAuthService
            .Setup(x => x.IsValidUserAsync(command.Login, command.Password))
            .ThrowsAsync(new InvalidOperationException("Database error"));

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_WhenAuthServiceThrows_ShouldReturnGenericErrorMessage()
    {
        // Arrange
        var command = new LoginCommand("testuser", "Password123!");
        
        _mockAuthService
            .Setup(x => x.IsValidUserAsync(command.Login, command.Password))
            .ThrowsAsync(new InvalidOperationException("Database error"));

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Errors.Should().Contain(e => e.Code == "Auth.ServiceError");
        result.Errors.Should().Contain(e => e.Description == "An unexpected error occurred. Please try again.");
    }

    [Fact]
    public async Task Handle_WhenAuthServiceThrows_ShouldNotGenerateToken()
    {
        // Arrange
        var command = new LoginCommand("testuser", "Password123!");
        
        _mockAuthService
            .Setup(x => x.IsValidUserAsync(command.Login, command.Password))
            .ThrowsAsync(new InvalidOperationException("Database error"));

        // Act
        await _handler.Handle(command, CancellationToken.None);

        // Assert
        _mockJwtProvider.Verify(
            x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()), 
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenAuthServiceThrows_ShouldLogError()
    {
        // Arrange
        var command = new LoginCommand("testuser", "Password123!");
        var exception = new InvalidOperationException("Database error");
        
        _mockAuthService
            .Setup(x => x.IsValidUserAsync(command.Login, command.Password))
            .ThrowsAsync(exception);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        _mockLogger.Verify(
            x => x.Log(
                LogLevel.Error,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => true),
                exception,
                It.Is<Func<It.IsAnyType, Exception?, string>>((v, t) => true)),
            Times.Once);
    }

    #endregion

    #region Multiple Login Attempts Tests

    [Theory]
    [InlineData("user1", "Password123!")]
    [InlineData("user2", "Password456!")]
    [InlineData("admin", "AdminPass789!")]
    public async Task Handle_WithDifferentUsers_ShouldCallAuthServiceForEach(string login, string password)
    {
        // Arrange
        var command = new LoginCommand(login, password);
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(login, password))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(userId, login))
            .Returns("token");

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        _mockAuthService.Verify(
            x => x.IsValidUserAsync(login, password), 
            Times.Once);
    }

    #endregion

    #region Response Dto Tests

    [Fact]
    public async Task Handle_WithValidCredentials_ShouldReturnAuthDtoWithLogin()
    {
        // Arrange
        var command = new LoginCommand("myuser", "MyPassword123!");
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(userId, command.Login))
            .Returns("token");

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Data.Should().NotBeNull();
        result.Data!.Login.Should().Be("myuser");
    }

    [Fact]
    public async Task Handle_WithValidCredentials_ShouldReturnAuthDtoWithExpiration()
    {
        // Arrange
        var command = new LoginCommand("testuser", "Password123!");
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);
        var expectedExpiresIn = DateTime.UtcNow.AddDays(35);

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(userId, command.Login))
            .Returns("token");

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Data.Should().NotBeNull();
        result.Data!.ExpiresIn.Should().BeCloseTo(expectedExpiresIn, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Handle_WithValidCredentials_ShouldReturnAuthDtoWithRefreshToken()
    {
        // Arrange
        var command = new LoginCommand("testuser", "Password123!");
        var userId = Guid.NewGuid();
        var authResult = Result.Success<Guid>(userId);

        _mockAuthService
            .Setup(x => x.IsValidUserAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.FromResult(authResult));

        _mockJwtProvider
            .Setup(x => x.GenerateToken(userId, command.Login))
            .Returns("token");

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("test-refresh-token");

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Data.Should().NotBeNull();
        result.Data!.RefreshToken.Should().NotBeNull();
        result.Data!.RefreshToken.Should().Be("test-refresh-token");
    }

    #endregion
}