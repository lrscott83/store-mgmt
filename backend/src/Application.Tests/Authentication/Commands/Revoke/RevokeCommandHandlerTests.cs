using Application.Abstractions.HttpContext;
using Application.Features.Authentication.Commands.Revoke;
using Domain.Common.Extensions;
using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace Application.Tests.Authentication.Commands.Revoke;

/// <summary>
/// Tests for RevokeCommandHandler covering:
/// - Revoking a specific token
/// - Revoking all active tokens for a user
/// - Idempotent behavior when revoking an already revoked token
/// </summary>
public class RevokeCommandHandlerTests
{
    private readonly Mock<IRefreshTokenRepository> _mockRefreshTokenRepo;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<ILogger<RevokeCommandHandler>> _mockLogger;
    private readonly RevokeCommandHandler _handler;

    public RevokeCommandHandlerTests()
    {
        _mockRefreshTokenRepo = new Mock<IRefreshTokenRepository>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLogger = new Mock<ILogger<RevokeCommandHandler>>();

        _handler = new RevokeCommandHandler(
            _mockRefreshTokenRepo.Object,
            _mockHttpContextService.Object,
            _mockLogger.Object);
    }

    [Fact]
    public async Task Revoke_specificToken_marksRevoked()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "token-to-revoke";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);

        // Act
        var result = await _handler.Handle(new RevokeCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();

        // Token should now be revoked
        refreshToken.IsRevoked.Should().BeTrue();
        _mockRefreshTokenRepo.Verify(x => x.Update(refreshToken), Times.Once);
    }

    [Fact]
    public async Task Revoke_withoutToken_revokesAllActive()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var userExternalId = userId.ToString();

        var activeTokens = new List<RefreshToken>
        {
            new(userId, "token-1", DateTimeOffset.UtcNow.AddDays(7)),
            new(userId, "token-2", DateTimeOffset.UtcNow.AddDays(7))
        };

        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(userExternalId);

        _mockRefreshTokenRepo
            .Setup(x => x.GetActiveByUserIdAsync(userId))
            .ReturnsAsync(activeTokens);

        // Act
        var result = await _handler.Handle(new RevokeCommand(null), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();

        // All tokens should now be revoked
        activeTokens.Should().AllSatisfy(t => t.IsRevoked.Should().BeTrue());
        _mockRefreshTokenRepo.Verify(x => x.Update(It.IsAny<RefreshToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task Revoke_alreadyRevoked_isIdempotent()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "already-revoked-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        refreshToken.Revoke(); // Already revoked

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);

        // Act
        var result = await _handler.Handle(new RevokeCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();

        // Update should NOT be called because token was already revoked
        _mockRefreshTokenRepo.Verify(x => x.Update(It.IsAny<RefreshToken>()), Times.Never);
    }

    [Fact]
    public async Task Revoke_nonExistentToken_returnsSuccess()
    {
        // Arrange
        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync((RefreshToken?)null);

        // Act
        var result = await _handler.Handle(new RevokeCommand("non-existent-token"), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();

        // Update should NOT be called
        _mockRefreshTokenRepo.Verify(x => x.Update(It.IsAny<RefreshToken>()), Times.Never);
    }

    [Fact]
    public async Task Revoke_withoutToken_noActiveTokens_returnsSuccess()
    {
        // Arrange
        var userId = Guid.NewGuid();

        _mockHttpContextService
            .Setup(x => x.UserExternalId)
            .Returns(userId.ToString());

        _mockRefreshTokenRepo
            .Setup(x => x.GetActiveByUserIdAsync(userId))
            .ReturnsAsync(new List<RefreshToken>());

        // Act
        var result = await _handler.Handle(new RevokeCommand(null), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();

        // Update should NOT be called
        _mockRefreshTokenRepo.Verify(x => x.Update(It.IsAny<RefreshToken>()), Times.Never);
    }
}
