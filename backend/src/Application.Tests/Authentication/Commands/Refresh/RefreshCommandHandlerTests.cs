using Application.Abstractions.Authentication;
using Application.Features.Authentication.Commands.Refresh;
using Domain.Entities.Authentication;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;

namespace Application.Tests.Authentication.Commands.Refresh;

/// <summary>
/// Tests for RefreshCommandHandler covering:
/// - Valid token refresh produces new tokens
/// - Revoked token is rejected
/// - Expired token is rejected
/// - Token rotation revokes the old token
/// </summary>
public class RefreshCommandHandlerTests
{
    private readonly Mock<IRefreshTokenRepository> _mockRefreshTokenRepo;
    private readonly Mock<IJwtProvider> _mockJwtProvider;
    private readonly Mock<IUserRepository> _mockUserRepo;
    private readonly Mock<ILogger<RefreshCommandHandler>> _mockLogger;
    private readonly AuthenticationSettings _authSettings;
    private readonly RefreshCommandHandler _handler;

    public RefreshCommandHandlerTests()
    {
        _mockRefreshTokenRepo = new Mock<IRefreshTokenRepository>();
        _mockJwtProvider = new Mock<IJwtProvider>();
        _mockUserRepo = new Mock<IUserRepository>();
        _mockLogger = new Mock<ILogger<RefreshCommandHandler>>();

        _authSettings = new AuthenticationSettings
        {
            Pepper = "test-pepper",
            Iterations = 3,
            TokenLifetimeDays = 35,
            RefreshTokenExpirationDays = 7
        };

        _handler = new RefreshCommandHandler(
            _mockRefreshTokenRepo.Object,
            _mockJwtProvider.Object,
            _mockUserRepo.Object,
            Options.Create(_authSettings),
            _mockLogger.Object);
    }

    [Fact]
    public async Task Refresh_withValidToken_returnsNewTokens()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "valid-raw-refresh-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        var user = CreateTestUser(userId, "testuser@test.com");

        var newAccessToken = "new-access-token";
        var newRawRefreshToken = "new-raw-refresh-token";

        SetupMocksForValidToken(refreshToken, user, newAccessToken, newRawRefreshToken);

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.AuthToken.Should().Be(newAccessToken);
        result.Data.RefreshToken.Should().Be(newRawRefreshToken);
    }

    [Fact]
    public async Task Refresh_withRevokedToken_returnsFailure()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "revoked-raw-refresh-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        refreshToken.Revoke(); // Mark as revoked

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.InvalidRefreshToken");
        result.ActionCode.Should().Be(401);
    }

    [Fact]
    public async Task Refresh_withExpiredToken_returnsFailure()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "expired-raw-refresh-token";
        // Token expires in the past
        var expiredToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(-1));

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(expiredToken);

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.InvalidRefreshToken");
        result.ActionCode.Should().Be(401);
    }

    [Fact]
    public async Task Refresh_rotatesToken_revokesOldToken()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "old-raw-refresh-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        var user = CreateTestUser(userId, "testuser@test.com");

        SetupMocksForValidToken(refreshToken, user, "new-access-token", "new-raw-refresh-token");

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        // Old token should be revoked
        refreshToken.IsRevoked.Should().BeTrue();
        refreshToken.RevokedAt.Should().NotBeNull();
        refreshToken.ReplacedByToken.Should().Be("new-raw-refresh-token");

        // Repository should have been called to update old token and add new one
        _mockRefreshTokenRepo.Verify(x => x.Update(refreshToken), Times.Once);
        _mockRefreshTokenRepo.Verify(x => x.Add(It.IsAny<RefreshToken>()), Times.Once);
    }

    [Fact]
    public async Task Refresh_withNonExistentToken_returnsFailure()
    {
        // Arrange
        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync((RefreshToken?)null);

        // Act
        var result = await _handler.Handle(new RefreshCommand("non-existent-token"), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.InvalidRefreshToken");
    }

    #region Helper Methods

    private void SetupMocksForValidToken(
        RefreshToken refreshToken,
        User user,
        string newAccessToken,
        string newRawRefreshToken)
    {
        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);

        _mockUserRepo
            .Setup(x => x.GetByIdAsync(user.Id))
            .ReturnsAsync(user);

        _mockJwtProvider
            .Setup(x => x.GenerateToken(user.Id, user.Login))
            .Returns(newAccessToken);

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns(newRawRefreshToken);
    }

    private static User CreateTestUser(Guid userId, string login)
    {
        var user = User.Create(login, "hashed_password", "Test User", "+1234567890", "test@example.com", Guid.NewGuid());
        typeof(User).GetProperty("Id")!.SetValue(user, userId);
        return user;
    }

    #endregion
}
