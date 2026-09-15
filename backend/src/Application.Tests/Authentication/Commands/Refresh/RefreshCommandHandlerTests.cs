using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Features.Authentication.Commands.Refresh;
using Application.Services.Tenants;
using Application.UnitOfWorks;
using Domain.Entities.Authentication;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
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
/// - store-deactivation-session-revocation: activation-state matrix (user/
///   selected-store/owner IsActive) mirrors /me — failure is 401 + the
///   presented token is revoked and saved (refresh-token-persistence R4
///   carve-out).
/// </summary>
public class RefreshCommandHandlerTests
{
    private readonly Mock<IRefreshTokenRepository> _mockRefreshTokenRepo;
    private readonly Mock<IJwtProvider> _mockJwtProvider;
    private readonly Mock<IUserRepository> _mockUserRepo;
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<ILogger<RefreshCommandHandler>> _mockLogger;
    private readonly Mock<IStoreRepository> _mockStoreRepo;
    private readonly Mock<IOwnerRepository> _mockOwnerRepo;
    private readonly AuthenticationSettings _authSettings;
    private readonly RefreshCommandHandler _handler;

    public RefreshCommandHandlerTests()
    {
        _mockRefreshTokenRepo = new Mock<IRefreshTokenRepository>();
        _mockJwtProvider = new Mock<IJwtProvider>();
        _mockUserRepo = new Mock<IUserRepository>();
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockLogger = new Mock<ILogger<RefreshCommandHandler>>();
        _mockStoreRepo = new Mock<IStoreRepository>();
        _mockOwnerRepo = new Mock<IOwnerRepository>();

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        _authSettings = new AuthenticationSettings
        {
            Pepper = "test-pepper",
            TokenLifetimeDays = 35,
            RefreshTokenExpirationDays = 7
        };

        _handler = new RefreshCommandHandler(
            _mockRefreshTokenRepo.Object,
            _mockJwtProvider.Object,
            _mockUserRepo.Object,
            Options.Create(_authSettings),
            _mockLogger.Object,
            _mockUnitOfWork.Object,
            _mockStoreRepo.Object,
            _mockOwnerRepo.Object);
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
    public async Task Refresh_withValidToken_returnsEmptyWrapFields()
    {
        // Arrange — auth-login-wrapped-dek R4: Refresh never delivers a wrapped DEK
        var userId = Guid.NewGuid();
        var rawToken = "valid-raw-refresh-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        var user = CreateTestUser(userId, "testuser@test.com");

        SetupMocksForValidToken(refreshToken, user, "new-access-token", "new-raw-refresh-token");

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.WrappedDek.Should().BeEmpty();
        result.Data.WrapSalt.Should().BeEmpty();
        result.Data.WrapIv.Should().BeEmpty();
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

    #region Activation-State Matrix (store-deactivation-session-revocation)

    // The store/owner lookups use Where(...).IgnoreQueryFilters().FirstOrDefaultAsync()
    // — a pure Moq IQueryable cannot carry the EF async chain (GetMeQueryHandlerTests
    // documents the same limitation). These tests use REAL repositories over an
    // InMemory context, the established pattern for this handler shape.

    private static (ApplicationDbContext Context, StoreRepository Stores, OwnerRepository Owners) CreateRepoContext()
    {
        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(false);
        httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var context = new ApplicationDbContext(options, new TenantIdProvider(new HttpContextAccessor()), httpContextMock.Object);
        return (context, new StoreRepository(context), new OwnerRepository(context));
    }

    [Fact]
    public async Task Refresh_inactiveUser_returns401_revokesAndSaves()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "inactive-user-raw-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        var user = CreateTestUser(userId, "inactive@test.com");
        user.IsActive = false;

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);
        _mockUserRepo
            .Setup(x => x.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString()))
            .ReturnsAsync(user);

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert: 401 Auth.AccountInactive + the presented token revoked AND saved
        result.Succeeded.Should().BeFalse();
        result.ActionCode.Should().Be(401);
        result.Errors.Should().Contain(e => e.Code == "Auth.AccountInactive");
        refreshToken.IsRevoked.Should().BeTrue();
        _mockRefreshTokenRepo.Verify(x => x.Update(refreshToken), Times.Once);
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Refresh_inactiveSelectedStore_returns401_revokesAndSaves()
    {
        // Arrange
        var (context, stores, owners) = CreateRepoContext();
        try
        {
            var userId = Guid.NewGuid();
            var storeId = Guid.NewGuid();
            var rawToken = "inactive-store-raw-token";
            var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
            var user = CreateTestUser(userId, "storeuser@test.com");
            user.SelectedStoreId = storeId;

            var store = CreateStore(storeId, isActive: false, ownerId: Guid.NewGuid());
            context.Set<Store>().Add(store);
            await context.SaveChangesAsync();

            var handler = new RefreshCommandHandler(
                _mockRefreshTokenRepo.Object,
                _mockJwtProvider.Object,
                _mockUserRepo.Object,
                Microsoft.Extensions.Options.Options.Create(_authSettings),
                _mockLogger.Object,
                _mockUnitOfWork.Object,
                stores,
                owners);

            _mockRefreshTokenRepo
                .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
                .ReturnsAsync(refreshToken);
            _mockUserRepo
                .Setup(x => x.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString()))
                .ReturnsAsync(user);

            // Act
            var result = await handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

            // Assert: 401 Store.Inactive + token revoked + saved
            result.Succeeded.Should().BeFalse();
            result.ActionCode.Should().Be(401);
            result.Errors.Should().Contain(e => e.Code == "Store.Inactive");
            refreshToken.IsRevoked.Should().BeTrue();
            _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        }
        finally
        {
            await context.DisposeAsync();
        }
    }

    [Fact]
    public async Task Refresh_inactiveOwner_returns401_revokesAndSaves()
    {
        // Arrange
        var (context, stores, owners) = CreateRepoContext();
        try
        {
            var userId = Guid.NewGuid();
            var storeId = Guid.NewGuid();
            var ownerId = Guid.NewGuid();
            var rawToken = "inactive-owner-raw-token";
            var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
            var user = CreateTestUser(userId, "owneruser@test.com");
            user.SelectedStoreId = storeId;

            var store = CreateStore(storeId, isActive: true, ownerId);
            // 5-arg Create pins the Owner's Id to the store's OwnerId so the
            // handler's o.Id == store.OwnerId lookup actually finds this owner.
            var owner = Owner.Create(ownerId, Guid.NewGuid(), false, Guid.NewGuid(), "Inactive Owner");
            owner.IsActive = false;
            context.Set<Store>().Add(store);
            context.Set<Owner>().Add(owner);
            await context.SaveChangesAsync();

            var handler = new RefreshCommandHandler(
                _mockRefreshTokenRepo.Object,
                _mockJwtProvider.Object,
                _mockUserRepo.Object,
                Microsoft.Extensions.Options.Options.Create(_authSettings),
                Microsoft.Extensions.Logging.Abstractions.NullLogger<RefreshCommandHandler>.Instance,
                _mockUnitOfWork.Object,
                stores,
                owners);

            _mockRefreshTokenRepo
                .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
                .ReturnsAsync(refreshToken);
            _mockUserRepo
                .Setup(x => x.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString()))
                .ReturnsAsync(user);

            // Act
            var result = await handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

            // Assert: 401 Owner.Inactive + token revoked + saved
            result.Succeeded.Should().BeFalse();
            result.ActionCode.Should().Be(401);
            result.Errors.Should().Contain(e => e.Code == "Owner.Inactive");
            refreshToken.IsRevoked.Should().BeTrue();
            _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        }
        finally
        {
            await context.DisposeAsync();
        }
    }

    [Fact]
    public async Task Refresh_activeMatrix_rotatesNormally()
    {
        // Arrange — active user on an active store with an active owner: the R2
        // rotation contract is untouched by the hardening.
        var (context, stores, owners) = CreateRepoContext();
        try
        {
            var userId = Guid.NewGuid();
            var storeId = Guid.NewGuid();
            var rawToken = "active-matrix-raw-token";
            var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
            var user = CreateTestUser(userId, "active@test.com");
            user.SelectedStoreId = storeId;

            var store = CreateStore(storeId, isActive: true, ownerId: Guid.NewGuid());
            // 5-arg Create pins the owner's Id to the store's OwnerId — otherwise
            // the lookup misses and the owner check is exercised vacuously.
            var owner = Owner.Create(store.OwnerId, Guid.NewGuid(), false, Guid.NewGuid(), "Active Owner");
            context.Set<Store>().Add(store);
            context.Set<Owner>().Add(owner);
            await context.SaveChangesAsync();

            var handler = new RefreshCommandHandler(
                _mockRefreshTokenRepo.Object,
                _mockJwtProvider.Object,
                _mockUserRepo.Object,
                Microsoft.Extensions.Options.Options.Create(_authSettings),
                _mockLogger.Object,
                _mockUnitOfWork.Object,
                stores,
                owners);

            _mockRefreshTokenRepo
                .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
                .ReturnsAsync(refreshToken);
            _mockUserRepo
                .Setup(x => x.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString()))
                .ReturnsAsync(user);
            _mockJwtProvider.Setup(x => x.GenerateToken(user.Id, user.Login)).Returns("new-access");
            _mockJwtProvider.Setup(x => x.GenerateRefreshToken()).Returns("new-raw");

            // Act
            var result = await handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

            // Assert
            result.Succeeded.Should().BeTrue();
            result.Data!.RefreshToken.Should().Be("new-raw");
            _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        }
        finally
        {
            await context.DisposeAsync();
        }
    }

    [Fact]
    public async Task Refresh_noSelectedStore_skipsStoreChecks()
    {
        // Arrange — a user with SelectedStoreId == Guid.Empty (e.g. SuperAdmin
        // before store selection) skips the store/owner checks entirely.
        var userId = Guid.NewGuid();
        var rawToken = "no-store-raw-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        var user = CreateTestUser(userId, "nostore@test.com");

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);
        _mockUserRepo
            .Setup(x => x.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString()))
            .ReturnsAsync(user);
        _mockJwtProvider.Setup(x => x.GenerateToken(user.Id, user.Login)).Returns("new-access");
        _mockJwtProvider.Setup(x => x.GenerateRefreshToken()).Returns("new-raw");

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert — the pure-mock store repo is never touched because the store
        // branch is gated on SelectedStoreId != Guid.Empty before any lookup.
        result.Succeeded.Should().BeTrue();
        _mockStoreRepo.Verify(x => x.Where(It.IsAny<System.Linq.Expressions.Expression<Func<Store, bool>>>()), Times.Never);
    }

    #endregion

    #region Persistence Tests

    [Fact]
    public async Task Refresh_rotatesToken_persistsChanges()
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
        _mockRefreshTokenRepo.Verify(x => x.Update(refreshToken), Times.Once);
        _mockRefreshTokenRepo.Verify(x => x.Add(It.IsAny<RefreshToken>()), Times.Once);
        _mockUnitOfWork.Verify(
            x => x.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Theory]
    [InlineData("null-token")]
    [InlineData("revoked-token")]
    [InlineData("expired-token")]
    public async Task Refresh_withInvalidToken_ShouldNotSave(string scenario)
    {
        // Arrange
        var userId = Guid.NewGuid();
        RefreshToken? refreshToken = scenario switch
        {
            "revoked-token" => RevokedToken(userId),
            "expired-token" => ExpiredToken(userId),
            _ => null
        };

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);

        // Act
        var result = await _handler.Handle(new RefreshCommand(scenario), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        _mockUnitOfWork.Verify(
            x => x.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Refresh_withValidToken_resolvesUser_ignoringTenantQueryFilters()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var rawToken = "valid-raw-refresh-token";
        var refreshToken = new RefreshToken(userId, rawToken, DateTimeOffset.UtcNow.AddDays(7));
        var user = CreateTestUser(userId, "testuser@test.com");

        _mockRefreshTokenRepo
            .Setup(x => x.GetByTokenHashAsync(It.IsAny<string>()))
            .ReturnsAsync(refreshToken);

        _mockJwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()))
            .Returns("new-access-token");

        _mockJwtProvider
            .Setup(x => x.GenerateRefreshToken())
            .Returns("new-raw-refresh-token");

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // The refresh endpoint is AllowAnonymous: the caller carries no tenant claims, so the
        // tenant query filter on User would hide the token's owner unless the lookup ignores
        // filters. The fix must resolve the user WITHOUT the tenant filter.
        _mockUserRepo
            .Setup(x => x.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString()))
            .ReturnsAsync(user);

        // Act
        var result = await _handler.Handle(new RefreshCommand(rawToken), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        _mockUserRepo.Verify(
            x => x.GetUserByIdIgnoreQueryFiltersAsync(userId.ToString()),
            Times.Once);
    }

    #endregion

    #region Helper Methods

    private static RefreshToken RevokedToken(Guid userId)
    {
        var token = new RefreshToken(userId, "revoked-raw-token", DateTimeOffset.UtcNow.AddDays(7));
        token.Revoke();
        return token;
    }

    private static RefreshToken ExpiredToken(Guid userId)
        => new(userId, "expired-raw-token", DateTimeOffset.UtcNow.AddDays(-1));

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
            .Setup(x => x.GetUserByIdIgnoreQueryFiltersAsync(user.Id.ToString()))
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

    private static Store CreateStore(Guid storeId, bool isActive, Guid ownerId)
    {
        var store = Store.Create($"Store-{storeId:N}", ownerId, true, Guid.NewGuid());
        typeof(Store).GetProperty("Id")!.SetValue(store, storeId);
        store.IsActive = isActive;
        return store;
    }

    #endregion
}
