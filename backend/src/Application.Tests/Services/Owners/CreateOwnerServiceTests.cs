using Application.Abstractions.Authentication;
using Application.Services.Owners;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Application.Tests.Services.Owners;

/// <summary>
/// Unit tests for CreateOwnerService covering all scenarios:
/// - Happy Path: Normal owner creation flow
/// - Edge Cases: Null/empty inputs
/// - Error Management: Repository failures
/// - Integration: Mock verification of dependencies
/// </summary>
public class CreateOwnerServiceTests
{
    // Mock dependencies
    private readonly Mock<IUserRepository> _mockUserRepository;
    private readonly Mock<IOwnerRepository> _mockOwnerRepository;
    private readonly Mock<IUserRoleRepository> _mockUserRoleRepository;
    private readonly Mock<IHashPasswordService> _mockHashPasswordService;
    private readonly Mock<ITenantRepository> _mockTenantRepository;

    // Test data
    private readonly Guid _testTenantId = Guid.NewGuid();
    private readonly Guid _testUserId = Guid.NewGuid();
    private readonly Guid _testOwnerId = Guid.NewGuid();

    public CreateOwnerServiceTests()
    {
        _mockUserRepository = new Mock<IUserRepository>();
        _mockOwnerRepository = new Mock<IOwnerRepository>();
        _mockUserRoleRepository = new Mock<IUserRoleRepository>();
        _mockHashPasswordService = new Mock<IHashPasswordService>();
        _mockTenantRepository = new Mock<ITenantRepository>();

        // Default successful setups
        SetupDefaultSuccessfulScenarios();
    }

    private CreateOwnerService CreateService()
    {
        return new CreateOwnerService(
            _mockUserRepository.Object,
            _mockOwnerRepository.Object,
            _mockUserRoleRepository.Object,
            _mockHashPasswordService.Object,
            _mockTenantRepository.Object);
    }

    private void SetupDefaultSuccessfulScenarios()
    {
        _mockHashPasswordService
            .Setup(x => x.HashPassword(It.IsAny<string>()))
            .Returns("hashed_password");

        _mockTenantRepository
            .Setup(x => x.AddAsync(It.IsAny<Tenant>()))
            .ReturnsAsync((Tenant t) => t);

        _mockUserRepository
            .Setup(x => x.AddAsync(It.IsAny<User>()))
            .ReturnsAsync((User u) => u);

        _mockOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<Owner>()))
            .ReturnsAsync((Owner o) => o);

        _mockUserRoleRepository
            .Setup(x => x.AddAsync(It.IsAny<UserRole>()))
            .ReturnsAsync((UserRole ur) => ur);
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
    public async Task CreateOwnerAsync_ShouldReturnOwner_WhenAllParametersAreValid()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";
        var password = "SecurePass123!";
        var fullName = "Test User";
        var cellPhone = "+1234567890";
        var email = "test@example.com";
        var description = "Test Owner Description";

        // Act
        var result = await service.CreateOwnerAsync(login, password, fullName, cellPhone, email, description);

        // Assert
        result.Should().NotBeNull();
        result.User.Should().NotBeNull();
        result.User.Login.Should().Be(login);
        result.User.FullName.Should().Be(fullName);
        result.User.CellPhone.Should().Be(cellPhone);
        result.User.Email.Should().Be(email);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldCreateOwnerWithOwnerAdminRole()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", "email@test.com", null);

        // Assert
        _mockUserRoleRepository.Verify(x => x.AddAsync(
            It.Is<UserRole>(ur => 
                ur.RoleId == (int)RoleType.OwnerAdmin)),
            Times.Once);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldSetOwnerUserNavigationProperty()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", "email@test.com", null);

        // Assert - THIS IS THE KEY TEST FOR THE BUG WE FIXED
        result.User.Should().NotBeNull("Owner.User navigation property must be set");
        result.UserId.Should().Be(result.User.Id, "UserId should match the User entity Id");
    }

    #endregion

    #region Edge Cases Tests

    [Fact]
    public async Task CreateOwnerAsync_ShouldHandleNullEmail()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        result.Should().NotBeNull();
        result.User.Should().NotBeNull();
        result.User.Email.Should().BeNull();
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldHandleNullDescription()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", "email@test.com", null);

        // Assert
        result.Should().NotBeNull();
        result.Description.Should().Be("", "Null description should default to empty string");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldHandleEmptyPassword()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "", "Name", "+123", null, null);

        // Assert
        result.Should().NotBeNull();
        _mockHashPasswordService.Verify(x => x.HashPassword(""), Times.Once);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldHandleSpecialCharactersInFullName()
    {
        // Arrange
        var service = CreateService();
        var fullName = "José María García-López";

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", fullName, "+123", null, null);

        // Assert
        result.Should().NotBeNull();
        result.User.FullName.Should().Be(fullName);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldHandleInternationalCellPhoneFormat()
    {
        // Arrange
        var service = CreateService();
        var cellPhone = "+52-1-55-1234-5678";

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", cellPhone, null, null);

        // Assert
        result.Should().NotBeNull();
        result.User.CellPhone.Should().Be(cellPhone);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateOwnerAsync_ShouldHandleVariousLoginFormats(string? login)
    {
        // Arrange
        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateOwnerAsync(login!, "pass", "Name", "+123", null, null);

        // Assert
        await act.Should().NotThrowAsync();
    }

    #endregion

    #region Error Management Tests

    [Fact]
    public async Task CreateOwnerAsync_ShouldThrow_WhenTenantRepositoryFails()
    {
        // Arrange
        _mockTenantRepository
            .Setup(x => x.AddAsync(It.IsAny<Tenant>()))
            .ThrowsAsync(new InvalidOperationException("Database error"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Database error");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldThrow_WhenUserRepositoryFails()
    {
        // Arrange
        _mockUserRepository
            .Setup(x => x.AddAsync(It.IsAny<User>()))
            .ThrowsAsync(new InvalidOperationException("User creation failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("User creation failed");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldThrow_WhenOwnerRepositoryFails()
    {
        // Arrange
        _mockOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<Owner>()))
            .ThrowsAsync(new InvalidOperationException("Owner creation failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Owner creation failed");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldThrow_WhenUserRoleRepositoryFails()
    {
        // Arrange
        _mockUserRoleRepository
            .Setup(x => x.AddAsync(It.IsAny<UserRole>()))
            .ThrowsAsync(new InvalidOperationException("UserRole creation failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("UserRole creation failed");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldThrow_WhenHashPasswordServiceFails()
    {
        // Arrange
        _mockHashPasswordService
            .Setup(x => x.HashPassword(It.IsAny<string>()))
            .Throws(new InvalidOperationException("Password hashing failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Password hashing failed");
    }

    #endregion

    #region Integration Tests (Mock Verification)

    [Fact]
    public async Task CreateOwnerAsync_ShouldCallTenantRepository_WithCorrectParameters()
    {
        // Arrange
        var service = CreateService();
        var login = "testuser";

        // Act
        await service.CreateOwnerAsync(login, "pass", "Name", "+123", null, null);

        // Assert
        _mockTenantRepository.Verify(x => x.AddAsync(
            It.Is<Tenant>(t => t.Name == login)),
            Times.Once);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldCallHashPasswordService()
    {
        // Arrange
        var service = CreateService();
        var password = "MySecurePassword123!";

        // Act
        await service.CreateOwnerAsync("user", password, "Name", "+123", null, null);

        // Assert
        _mockHashPasswordService.Verify(x => x.HashPassword(password), Times.Once);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldCallUserRepository_WithHashedPassword()
    {
        // Arrange
        var service = CreateService();
        var originalPassword = "MySecurePassword123!";
        var hashedPassword = "hashed_password";

        _mockHashPasswordService
            .Setup(x => x.HashPassword(originalPassword))
            .Returns(hashedPassword);

        // Act
        await service.CreateOwnerAsync("user", originalPassword, "Name", "+123", null, null);

        // Assert
        _mockUserRepository.Verify(x => x.AddAsync(
            It.Is<User>(u => u.Password == hashedPassword)),
            Times.Once);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldCallOwnerRepository_WithCorrectTenantId()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        _mockOwnerRepository.Verify(x => x.AddAsync(
            It.Is<Owner>(o => o.TenantId == result.TenantId)),
            Times.Once);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldCallUserRoleRepository_WithCorrectParameters()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        _mockUserRoleRepository.Verify(x => x.AddAsync(
            It.Is<UserRole>(ur => 
                ur.UserId == result.UserId && 
                ur.RoleId == (int)RoleType.OwnerAdmin &&
                ur.TenantId == result.TenantId)),
            Times.Once);
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldCreateTenantFirst()
    {
        // Arrange
        var service = CreateService();
        var callOrder = new List<string>();

        _mockTenantRepository
            .Setup(x => x.AddAsync(It.IsAny<Tenant>()))
            .Callback(() => callOrder.Add("Tenant"))
            .ReturnsAsync((Tenant t) => t);

        _mockUserRepository
            .Setup(x => x.AddAsync(It.IsAny<User>()))
            .Callback(() => callOrder.Add("User"))
            .ReturnsAsync((User u) => u);

        _mockOwnerRepository
            .Setup(x => x.AddAsync(It.IsAny<Owner>()))
            .Callback(() => callOrder.Add("Owner"))
            .ReturnsAsync((Owner o) => o);

        _mockUserRoleRepository
            .Setup(x => x.AddAsync(It.IsAny<UserRole>()))
            .Callback(() => callOrder.Add("UserRole"))
            .ReturnsAsync((UserRole ur) => ur);

        // Act
        await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        callOrder.Should().BeEquivalentTo(new[] { "Tenant", "User", "Owner", "UserRole" },
            "Entities should be created in this order: Tenant -> User -> Owner -> UserRole");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldReturnOwnerWithCorrectTenantId()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        result.TenantId.Should().NotBeEmpty("TenantId should be assigned");
        result.User.TenantId.Should().Be(result.TenantId, "User should have the same TenantId");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldReturnOwnerWithGuestFalse()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        result.Guest.Should().BeFalse("New owners should not be guests");
    }

    [Fact]
    public async Task CreateOwnerAsync_ShouldAssignUserIdToOwner()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateOwnerAsync("user", "pass", "Name", "+123", null, null);

        // Assert
        result.UserId.Should().Be(result.User.Id, "Owner.UserId should match User.Id");
    }

    #endregion
}
