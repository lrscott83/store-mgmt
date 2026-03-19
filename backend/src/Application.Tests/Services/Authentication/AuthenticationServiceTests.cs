using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
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
    private readonly Mock<IUserRoleRepository> _mockUserRoleRepository;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStoreUserRepository> _mockStoreUserRepository;
    private readonly Mock<IReSellerRepository> _mockReSellerRepository;
    private readonly Mock<IOwnerRepository> _mockOwnerRepository;

    // Test data
    private readonly Guid _testUserId = Guid.NewGuid();
    private readonly Guid _testOwnerId = Guid.NewGuid();
    private readonly Guid _testStoreId = Guid.NewGuid();

    public AuthenticationServiceTests()
    {
        _mockUserRepository = new Mock<IUserRepository>();
        _mockHashPasswordService = new Mock<IHashPasswordService>();
        _mockUserRoleRepository = new Mock<IUserRoleRepository>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockStoreUserRepository = new Mock<IStoreUserRepository>();
        _mockReSellerRepository = new Mock<IReSellerRepository>();
        _mockOwnerRepository = new Mock<IOwnerRepository>();

        // Default successful setups
        SetupDefaultSuccessfulScenarios();
    }

    private AuthenticationService CreateService()
    {
        return new AuthenticationService(
            _mockUserRepository.Object,
            _mockHashPasswordService.Object,
            _mockUserRoleRepository.Object,
            _mockStoreRepository.Object,
            _mockStoreUserRepository.Object,
            _mockReSellerRepository.Object,
            _mockOwnerRepository.Object);
    }

    private void SetupDefaultSuccessfulScenarios()
    {
        // Setup a valid active user
        var activeUser = CreateActiveUser();
        var activeOwner = CreateActiveOwner(activeUser);
        var activeStore = CreateActiveStore(activeOwner);

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(It.IsAny<string>()))
            .ReturnsAsync(activeUser);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(It.IsAny<string>()))
            .Returns("hashed_password");

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(It.IsAny<string>()))
            .ReturnsAsync((string login) => CreateActiveUser(login));

        // Default: not a reseller, not a super admin, not a store admin, has active store
        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((ReSeller?)null);

        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((Guid userId) => CreateActiveOwner(CreateActiveUser()));

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockUserRoleRepository
            .Setup(x => x.IsStoreAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockStoreUserRepository
            .Setup(x => x.GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((Guid userId) => CreateActiveStoreUser(CreateActiveUser(), CreateActiveStore(CreateActiveOwner(CreateActiveUser()))));
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

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((ReSeller?)null);

        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync(CreateActiveOwner(CreateActiveUser()));

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockUserRoleRepository
            .Setup(x => x.IsStoreAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockStoreUserRepository
            .Setup(x => x.GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync(CreateActiveStoreUser(CreateActiveUser(), CreateActiveStore(CreateActiveOwner(CreateActiveUser()))));

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        var user = CreateActiveUser(login);
        user.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(user);

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

        var adminUser = CreateActiveUser(login);
        adminUser.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(adminUser);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(_testUserId))
            .ReturnsAsync(true);

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((ReSeller?)null);

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

        var storeAdminUser = CreateActiveUser(login);
        storeAdminUser.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(storeAdminUser);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockUserRoleRepository
            .Setup(x => x.IsStoreAdmin(_testUserId))
            .ReturnsAsync(true);

        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync(new List<Store> { CreateActiveStore(CreateActiveOwner(storeAdminUser)) });

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((ReSeller?)null);

        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((Owner?)null);

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

        var reSellerUser = CreateActiveUser(login);
        reSellerUser.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(reSellerUser);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        var activeReSeller = CreateActiveReSeller(reSellerUser);
        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync(activeReSeller);

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
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync((User?)null);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "User.NotFound");
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
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(inactiveUser);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "User.Inactive");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenPasswordIsInvalid()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var correctPassword = "CorrectPassword123!";
        var wrongPassword = "WrongPassword456!";

        var user = CreateActiveUser(login);
        user.Password = "hashed_correct_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(wrongPassword))
            .Returns("hashed_wrong_password");

        _mockHashPasswordService
            .Setup(x => x.HashPassword(correctPassword))
            .Returns("hashed_correct_password");

        // Act
        var result = await service.IsValidUserAsync(login, wrongPassword);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "User.InvalidPassword");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenOwnerIsInactive()
    {
        // Arrange
        var service = CreateService();
        var login = "inactiveowner";
        var password = "password";

        var ownerUser = CreateActiveUser(login);
        ownerUser.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(ownerUser);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((ReSeller?)null);

        var inactiveOwner = CreateInactiveOwner(ownerUser);
        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync(inactiveOwner);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "User.Inactive");
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldReturnFailure_WhenStoreAdminHasNoActiveStores()
    {
        // Arrange
        var service = CreateService();
        var login = "storeadminnostore";
        var password = "password";

        var storeAdminUser = CreateActiveUser(login);
        storeAdminUser.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(storeAdminUser);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockUserRoleRepository
            .Setup(x => x.IsStoreAdmin(_testUserId))
            .ReturnsAsync(true);

        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync(new List<Store>());

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((ReSeller?)null);

        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((Owner?)null);

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
        user.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockUserRoleRepository
            .Setup(x => x.IsStoreAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((ReSeller?)null);

        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync((Owner?)null);

        var inactiveStoreUser = CreateInactiveStoreUser(user, CreateActiveStore(CreateActiveOwner(user)));
        _mockStoreUserRepository
            .Setup(x => x.GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(_testUserId))
            .ReturnsAsync(inactiveStoreUser);

        // Act
        var result = await service.IsValidUserAsync(login, password);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Code == "Store.Inactive");
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
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(null!))
            .Returns("hashed_null");

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
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
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
        user.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockUserRoleRepository
            .Setup(x => x.IsStoreAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((ReSeller?)null);

        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((Owner?)null);

        _mockStoreUserRepository
            .Setup(x => x.GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StoreUser?)null);

        // Act
        await service.IsValidUserAsync(login, password);

        // Assert
        _mockUserRepository.Verify(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login), Times.Once);
    }

    [Fact]
    public async Task IsValidUserAsync_ShouldCallHashPasswordService_WithCorrectPassword()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var password = "MySecurePassword123!";

        var user = CreateActiveUser(login);
        user.Password = "hashed_password";

        _mockUserRepository
            .Setup(x => x.GetUserByLoginIgnoreQueryFiltersAsync(login))
            .ReturnsAsync(user);

        _mockHashPasswordService
            .Setup(x => x.HashPassword(password))
            .Returns("hashed_password");

        _mockUserRoleRepository
            .Setup(x => x.IsSuperAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockUserRoleRepository
            .Setup(x => x.IsStoreAdmin(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        _mockReSellerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((ReSeller?)null);

        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((Owner?)null);

        _mockStoreUserRepository
            .Setup(x => x.GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StoreUser?)null);

        // Act
        await service.IsValidUserAsync(login, password);

        // Assert
        _mockHashPasswordService.Verify(x => x.HashPassword(password), Times.Once);
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
        return reSeller;
    }

    private StoreUser CreateActiveStoreUser(User user, Store store)
    {
        var storeUser = StoreUser.Create(user.Id, store.Id, Guid.NewGuid());
        // Use reflection to set navigation properties since they're not part of Create()
        typeof(StoreUser).GetProperty("User")!.SetValue(storeUser, user);
        typeof(StoreUser).GetProperty("Store")!.SetValue(storeUser, store);
        storeUser.IsActive = true;
        return storeUser;
    }

    private StoreUser CreateInactiveStoreUser(User user, Store store)
    {
        var storeUser = StoreUser.Create(user.Id, store.Id, Guid.NewGuid());
        // Use reflection to set navigation properties since they're not part of Create()
        typeof(StoreUser).GetProperty("User")!.SetValue(storeUser, user);
        typeof(StoreUser).GetProperty("Store")!.SetValue(storeUser, store);
        storeUser.IsActive = false;
        return storeUser;
    }

    #endregion
}
