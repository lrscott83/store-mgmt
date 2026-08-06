using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using Domain.Common.Enums;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Roles;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using Moq;

namespace Application.Tests.Services.Authentication;

/// <summary>
/// Unit tests for AuthenticationService covering all scenarios:
/// - Happy Path: Valid user authentication
/// - Error Cases: Invalid login, password, inactive entities
/// - Integration: Mock verification of dependencies
/// </summary>
public class AuthenticationServiceTests
{
    // Mock dependencies
    private readonly Mock<IUserRepository> _mockUserRepository;
    private readonly Mock<IHashPasswordService> _mockHashPasswordService;
    private readonly Mock<IOfflinePreHashProtector> _mockPreHashProtector;
    private readonly Mock<ILogger<AuthenticationService>> _mockLogger;

    // Test data
    private readonly Guid _testUserId = Guid.NewGuid();
    private readonly Guid _testOwnerId = Guid.NewGuid();
    private readonly Guid _testStoreId = Guid.NewGuid();

    public AuthenticationServiceTests()
    {
        _mockUserRepository = new Mock<IUserRepository>();
        _mockHashPasswordService = new Mock<IHashPasswordService>();
        _mockPreHashProtector = new Mock<IOfflinePreHashProtector>();
        _mockLogger = new Mock<ILogger<AuthenticationService>>();

        // Default successful setups
        SetupDefaultSuccessfulScenarios();
    }

    private AuthenticationService CreateService()
    {
        return new AuthenticationService(
            _mockUserRepository.Object,
            _mockHashPasswordService.Object,
            _mockPreHashProtector.Object,
            _mockLogger.Object);
    }

    private void SetupDefaultSuccessfulScenarios()
    {
        // Setup a valid active user with populated nav properties
        var activeUser = CreateActiveUserWithNavProps();

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(It.IsAny<string>()))
            .ReturnsAsync((string login) => CreateActiveUserWithNavProps(login));

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(true);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(It.IsAny<string>()))
            .Returns("hashed_password_new_format");

        // R21 backfill: every test user here starts with OfflinePasswordPreHash == null
        // (CreateActiveUser never sets it), so IsValidUserAsync's backfill branch always
        // fires on a successful login. Stub it so it's a harmless no-op for tests whose
        // concern is the login result, not the backfill itself (that's covered by
        // ExportOfflineRosterQueryHandlerTests / OfflinePreHashProtectorTests).
        _mockPreHashProtector
            .Setup(x => x.Protect(It.IsAny<string>(), It.IsAny<Guid>()))
            .Returns("mock-envelope");

        _mockUserRepository
            .Setup(x => x.SetOfflinePasswordPreHashIfNullAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
    }

    private User CreateActiveUserWithNavProps(string login = "testuser")
    {
        var user = CreateActiveUser(login);
        // Use a BCrypt-like prefix to avoid triggering unnecessary upgrade in default setup
        user.Password = "$2a$11$hashed_password_new_format";

        // Populate nav properties with default active values
        user.ReSeller = null;
        user.Owner = CreateActiveOwner(user);

        var store = CreateActiveStore((Owner)user.Owner);
        user.StoreUser = CreateActiveStoreUser(user, store);

        var superAdminRole = Role.Create((int)RoleType.SuperAdmin, "SuperAdmin", "", DateTimeOffset.UtcNow);
        // Default user is not super admin or store admin
        user.UserRoles = new List<UserRole>();

        return user;
    }

    #region Constructor Tests

    [Fact]
    public void Constructor_ShouldNotThrow_WhenAllDependenciesAreProvided()
    {
        // Act
        var action = () => CreateService();

        // Assert
        action.Should().NotThrow();
    }

    #endregion

    #region Happy Path Tests

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnSuccess_WhenUserIsValidOwnerWithActiveStore()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var password = "ValidPassword123!";

        var user = CreateActiveUserWithNavProps(login);
        user.ReSeller = null;
        user.Owner = CreateActiveOwner(user);
        var store = CreateActiveStore((Owner)user.Owner);
        user.StoreUser = CreateActiveStoreUser(user, store);
        user.UserRoles = new List<UserRole>();
        user.Password = "$2a$11$stored_bcrypt_hash";

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, user.Password))
            .Returns(true);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password_new_format");

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().Be(_testUserId);
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnSuccess_WhenUserIsSuperAdmin()
    {
        // Arrange
        var service = CreateService();
        var login = "admin";
        var password = "AdminPassword123!";

        var adminUser = CreateActiveUserWithNavProps(login);
        adminUser.Password = "$2a$11$stored_bcrypt_hash";
        adminUser.Owner = null;
        adminUser.ReSeller = null;
        adminUser.StoreUser = null;

        var superAdminRole = Role.Create((int)RoleType.SuperAdmin, "SuperAdmin", "", DateTimeOffset.UtcNow);
        adminUser.UserRoles = new List<UserRole>
        {
            CreateUserRole(adminUser.Id, (int)RoleType.SuperAdmin, superAdminRole)
        };

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(adminUser);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, adminUser.Password))
            .Returns(true);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password_new_format");

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().Be(_testUserId);
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnSuccess_WhenUserIsStoreAdminWithActiveStores()
    {
        // Arrange
        var service = CreateService();
        var login = "storeadmin";
        var password = "StoreAdminPassword123!";

        var storeAdminUser = CreateActiveUserWithNavProps(login);
        storeAdminUser.Password = "$2a$11$stored_bcrypt_hash";
        storeAdminUser.ReSeller = null;
        storeAdminUser.Owner = null;

        var ownerAdminRole = Role.Create((int)RoleType.OwnerAdmin, "OwnerAdmin", "", DateTimeOffset.UtcNow);
        storeAdminUser.UserRoles = new List<UserRole>
        {
            CreateUserRole(storeAdminUser.Id, (int)RoleType.OwnerAdmin, ownerAdminRole)
        };

        var store = CreateActiveStore(CreateActiveOwner(storeAdminUser));
        storeAdminUser.StoreUser = CreateActiveStoreUser(storeAdminUser, store);

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(storeAdminUser);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, storeAdminUser.Password))
            .Returns(true);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password_new_format");

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnSuccess_WhenUserIsActiveReSeller()
    {
        // Arrange
        var service = CreateService();
        var login = "reseller";
        var password = "ResellerPassword123!";

        var reSellerUser = CreateActiveUserWithNavProps(login);
        reSellerUser.Password = "$2a$11$stored_bcrypt_hash";
        reSellerUser.Owner = null;

        var activeReSeller = CreateActiveReSeller(reSellerUser);
        reSellerUser.ReSeller = activeReSeller;

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(reSellerUser);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, reSellerUser.Password))
            .Returns(true);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password_new_format");

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    #endregion

    #region Error Management Tests

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenUserNotFound()
    {
        // Arrange
        var service = CreateService();
        var login = "nonexistent";
        var password = "anypassword";

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync((User?)null);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.InvalidCredentials");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenUserIsInactive()
    {
        // Arrange
        var service = CreateService();
        var login = "inactiveuser";
        var password = "anypassword";

        var inactiveUser = CreateActiveUser(login);
        inactiveUser.IsActive = false;

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(inactiveUser);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.AccountInactive");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenPasswordIsInvalid()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var password = "WrongPassword456!";

        var user = CreateActiveUser(login);
        user.Password = "$2a$11$stored_bcrypt_hash";

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, user.Password))
            .Returns(false);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.InvalidCredentials");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenOwnerIsInactive()
    {
        // Arrange
        var service = CreateService();
        var login = "inactiveowner";
        var password = "password";

        var ownerUser = CreateActiveUser(login);
        ownerUser.Password = "$2a$11$stored_bcrypt_hash";
        ownerUser.ReSeller = null;

        var inactiveOwner = CreateInactiveOwner(ownerUser);
        ownerUser.Owner = inactiveOwner;

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(ownerUser);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, ownerUser.Password))
            .Returns(true);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.AccountInactive");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenStoreAdminHasNoActiveStores()
    {
        // Arrange
        var service = CreateService();
        var login = "storeadminnostore";
        var password = "password";

        var storeAdminUser = CreateActiveUser(login);
        storeAdminUser.Password = "$2a$11$stored_bcrypt_hash";
        storeAdminUser.ReSeller = null;
        storeAdminUser.Owner = null;
        storeAdminUser.StoreUser = null;

        var ownerAdminRole = Role.Create((int)RoleType.OwnerAdmin, "OwnerAdmin", "", DateTimeOffset.UtcNow);
        storeAdminUser.UserRoles = new List<UserRole>
        {
            CreateUserRole(storeAdminUser.Id, (int)RoleType.OwnerAdmin, ownerAdminRole)
        };

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(storeAdminUser);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, storeAdminUser.Password))
            .Returns(true);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Store.Inactive");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenStoreUserIsInactive()
    {
        // Arrange
        var service = CreateService();
        var login = "userwithinactivestore";
        var password = "password";

        var user = CreateActiveUser(login);
        user.Password = "$2a$11$stored_bcrypt_hash";
        user.ReSeller = null;
        user.Owner = null;
        user.UserRoles = new List<UserRole>();

        var inactiveStoreUser = CreateInactiveStoreUser(user, CreateActiveStore(CreateActiveOwner(user)));
        user.StoreUser = inactiveStoreUser;

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, user.Password))
            .Returns(true);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Store.Inactive");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenReSellerIsInactive()
    {
        // Arrange
        var service = CreateService();
        var login = "inactivereseller";
        var password = "password";

        var reSellerUser = CreateActiveUser(login);
        reSellerUser.Password = "$2a$11$stored_bcrypt_hash";
        reSellerUser.Owner = null;

        var inactiveReSeller = CreateInactiveReSeller(reSellerUser);
        reSellerUser.ReSeller = inactiveReSeller;

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(reSellerUser);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, reSellerUser.Password))
            .Returns(true);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Auth.AccountInactive");
    }

    #endregion

    #region Edge Cases Tests

    [Fact]
    public async Task IsValidUserAsync_ShouldHandleNullPassword()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";

        var user = CreateActiveUser(login);

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(null!, user.Password))
            .Returns(false);

        // Act
        var result = await service.IsValidUserAsync(login, null!);

        // Assert
        result.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldHandleEmptyLogin()
    {
        // Arrange
        var service = CreateService();
        var login = "";
        var password = "password";

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync((User?)null);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
    }

    #endregion

    #region Integration Tests (Mock Verification)

    [Fact]
    public async Task IsValidUserAsync_ShouldCallUserRepository_WithCorrectLogin()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var password = "password";

        var user = CreateActiveUser(login);
        user.Password = "$2a$11$stored_bcrypt_hash";

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, user.Password))
            .Returns(false);

        // Act
        await service.IsValidUserAsync(login, password);

        // Assert
        _mockUserRepository.Verify(x => x.GetByLoginWithRelatedAsync(login), Times.Once);
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldCallVerifyPassword_WithCorrectPassword()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var password = "MySecurePassword123!";

        var user = CreateActiveUser(login);
        user.Password = "$2a$11$stored_bcrypt_hash";

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, user.Password))
            .Returns(false);

        // Act
        await service.IsValidUserAsync(login, password);

        // Assert
        _mockHashPasswordService.Verify(x => x.VerifyPassword(password, user.Password), Times.Once);
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldNotCallUpdateAsync_WhenPasswordDoesNotMatch()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var password = "wrongpassword";

        var user = CreateActiveUser(login);
        user.Password = "$2a$11$stored_bcrypt_hash";

        _mockUserRepository
            .Setup(x => x.GetByLoginWithRelatedAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.VerifyPassword(password, user.Password))
            .Returns(false);

        // Act
        await service.IsValidUserAsync(login, password);

        // Assert
        _mockUserRepository.Verify(x => x.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    #endregion

    #region Helper Methods

    private User CreateActiveUser(string login = "testuser")
    {
        var user = User.Create(login, "hashed_password", "Test User", "+1234567890", "test@example.com", Guid.NewGuid());
        typeof(User).GetProperty("Id")!.SetValue(user, _testUserId);
        user.IsActive = true;
        return user;
    }

    private Owner CreateActiveOwner(User user)
    {
        var owner = Owner.Create(user.Id, false, Guid.NewGuid(), "Test Owner");
        typeof(Owner).GetProperty("Id")!.SetValue(owner, _testOwnerId);
        owner.User = user;
        owner.IsActive = true;
        return owner;
    }

    private Owner CreateInactiveOwner(User user)
    {
        var owner = Owner.Create(user.Id, false, Guid.NewGuid(), "Inactive Owner");
        typeof(Owner).GetProperty("Id")!.SetValue(owner, _testOwnerId);
        owner.User = user;
        owner.IsActive = false;
        return owner;
    }

    private Store CreateActiveStore(Owner owner)
    {
        var store = Store.Create("Test Store", _testOwnerId, true, Guid.NewGuid(), DateOnly.FromDateTime(DateTime.UtcNow));
        typeof(Store).GetProperty("Id")!.SetValue(store, _testStoreId);
        typeof(Store).GetProperty("Owner")!.SetValue(store, owner);
        return store;
    }

    private ReSeller CreateActiveReSeller(User user)
    {
        var reSeller = ReSeller.Create(user.Id, true, 10f, 5f, Guid.NewGuid(), "Test ReSeller");
        typeof(ReSeller).GetProperty("Id")!.SetValue(reSeller, Guid.NewGuid());
        typeof(ReSeller).GetProperty("User")!.SetValue(reSeller, user);
        return reSeller;
    }

    private ReSeller CreateInactiveReSeller(User user)
    {
        var reSeller = ReSeller.Create(user.Id, false, 10f, 5f, Guid.NewGuid(), "Inactive ReSeller");
        typeof(ReSeller).GetProperty("Id")!.SetValue(reSeller, Guid.NewGuid());
        typeof(ReSeller).GetProperty("User")!.SetValue(reSeller, user);
        reSeller.IsActive = false;
        return reSeller;
    }

    private StoreUser CreateActiveStoreUser(User user, Store store)
    {
        var storeUser = StoreUser.Create(user.Id, store.Id, Guid.NewGuid());
        typeof(StoreUser).GetProperty("User")!.SetValue(storeUser, user);
        typeof(StoreUser).GetProperty("Store")!.SetValue(storeUser, store);
        storeUser.IsActive = true;
        return storeUser;
    }

    private StoreUser CreateInactiveStoreUser(User user, Store store)
    {
        var storeUser = StoreUser.Create(user.Id, store.Id, Guid.NewGuid());
        typeof(StoreUser).GetProperty("User")!.SetValue(storeUser, user);
        typeof(StoreUser).GetProperty("Store")!.SetValue(storeUser, store);
        storeUser.IsActive = false;
        return storeUser;
    }

    private UserRole CreateUserRole(Guid userId, int roleId, Role role)
    {
        var userRole = UserRole.Create(userId, roleId, Guid.NewGuid());
        typeof(UserRole).GetProperty("Role")!.SetValue(userRole, role);
        return userRole;
    }

    #endregion
}
