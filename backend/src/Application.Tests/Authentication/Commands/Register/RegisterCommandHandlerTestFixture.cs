using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Results;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Application.Features.Authentication.Commands.Register;
using Resources;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Base test fixture providing mock dependencies for RegisterCommandHandler tests.
/// </summary>
public abstract class RegisterCommandHandlerTestFixture
{
    // Mock dependencies
    protected readonly Mock<IApplicationUnitOfWork> MockUnitOfWork;
    protected readonly Mock<IUserRepository> MockUserRepository;
    protected readonly Mock<IHttpContextService> MockHttpContextService;
    protected readonly Mock<ICreateOwnerService> MockCreateOwnerService;
    protected readonly Mock<ICreateStoreService> MockCreateStoreService;
    protected readonly Mock<IModuleRepository> MockModuleRepository;
    protected readonly Mock<IReSellerRepository> MockReSellerRepository;
    protected readonly Mock<IReSellerOwnerRepository> MockReSellerOwnerRepository;
    protected readonly Mock<IJwtProvider> MockJwtProvider;
    protected readonly Mock<IStringLocalizer<I18n>> MockLocalizer;

    // Test data
    protected readonly Guid TestOwnerId = Guid.NewGuid();
    protected readonly Guid TestTenantId = Guid.NewGuid();
    protected readonly Guid TestStoreId = Guid.NewGuid();
    protected readonly Guid TestUserId = Guid.NewGuid();

    protected readonly User TestUser;
    protected readonly Owner TestOwner;
    protected readonly Store TestStore;
    protected readonly Module TestModule;

    protected RegisterCommandHandlerTestFixture()
    {
        // Initialize mocks
        MockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        MockUserRepository = new Mock<IUserRepository>();
        MockHttpContextService = new Mock<IHttpContextService>();
        MockCreateOwnerService = new Mock<ICreateOwnerService>();
        MockCreateStoreService = new Mock<ICreateStoreService>();
        MockModuleRepository = new Mock<IModuleRepository>();
        MockReSellerRepository = new Mock<IReSellerRepository>();
        MockReSellerOwnerRepository = new Mock<IReSellerOwnerRepository>();
        MockJwtProvider = new Mock<IJwtProvider>();
        MockLocalizer = new Mock<IStringLocalizer<I18n>>();

        // Setup JWT provider to return a mock token
        MockJwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()))
            .Returns("mock-jwt-token");

        // Initialize test entities
        TestUser = CreateTestUser();
        TestOwner = CreateTestOwner();
        TestStore = CreateTestStore();
        TestModule = CreateTestModule();

        // Default successful setups
        SetupDefaultSuccessfulScenarios();
    }

    /// <summary>
    /// Creates the handler instance with all mocked dependencies.
    /// </summary>
    protected RegisterCommandHandler CreateHandler()
    {
        return new RegisterCommandHandler(
            MockUnitOfWork.Object,
            MockUserRepository.Object,
            MockHttpContextService.Object,
            MockLocalizer.Object,
            MockCreateOwnerService.Object,
            MockCreateStoreService.Object,
            MockModuleRepository.Object,
            MockJwtProvider.Object,
            MockReSellerRepository.Object,
            MockReSellerOwnerRepository.Object);
    }

    /// <summary>
    /// Sets up the default successful scenarios for happy path tests.
    /// </summary>
    private void SetupDefaultSuccessfulScenarios()
    {
        // Owner creation succeeds
        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>()))
            .ReturnsAsync(TestOwner);

        // Module repository returns available modules
        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Module> { TestModule });

        // Store creation succeeds
        MockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<bool>(),
                It.IsAny<List<int>>()))
            .ReturnsAsync(TestStore);

        // SaveChanges succeeds
        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // JWT provider returns token directly
        MockJwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()))
            .Returns("mock-jwt-token-for-testing");
    }

    private User CreateTestUser()
    {
        var user = User.Create(
            "testuser",
            "hashedpassword",
            "Test User",
            "+1234567890",
            "test@example.com",
            TestTenantId);

        // Use reflection to set the Id since it's init-only
        typeof(Domain.Entities.Users.User)
            .GetProperty("Id")!
            .SetValue(user, TestUserId);

        return user;
    }

    private Owner CreateTestOwner()
    {
        var owner = Owner.Create(
            TestUserId,
            false,
            TestTenantId,
            "Test Owner Description");

        // Use reflection to set the Id since it's init-only
        typeof(Owner)
            .GetProperty("Id")!
            .SetValue(owner, TestOwnerId);

        // Set the User navigation property directly
        owner.User = TestUser;

        return owner;
    }

    private Store CreateTestStore()
    {
        var store = Store.Create(
            "Test Store",
            TestOwnerId,
            true,
            TestTenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));

        // Use reflection to set the Id since it's init-only
        typeof(Store)
            .GetProperty("Id")!
            .SetValue(store, TestStoreId);

        return store;
    }

    private Module CreateTestModule()
    {
        return Module.Create(
            id: 1,
            name: "Sales",
            order: 1,
            priceIncluded: true,
            price: 100f,
            discountPrice: 10f,
            percentDiscountPrice: 5f,
            availableToStore: true,
            isActive: true);
    }

    /// <summary>
    /// Creates a test ReSeller for testing referral code scenarios.
    /// </summary>
    protected ReSeller CreateTestReSeller()
    {
        var user = User.Create(
            "reseller",
            "hashedpassword",
            "ReSeller User",
            "+0987654321",
            "reseller@example.com",
            TestTenantId);

        var resellerId = Guid.NewGuid();
        typeof(Domain.Entities.Users.User)
            .GetProperty("Id")!
            .SetValue(user, resellerId);

        var reSeller = ReSeller.Create(
            resellerId,
            true,
            10f,
            5f,
            TestTenantId,
            "Test ReSeller");

        typeof(ReSeller)
            .GetProperty("Id")!
            .SetValue(reSeller, Guid.NewGuid());

        typeof(ReSeller)
            .GetProperty("User")!
            .SetValue(reSeller, user);

        return reSeller;
    }

    /// <summary>
    /// Creates a RegisterCommand with all valid fields.
    /// </summary>
    protected RegisterCommand CreateValidCommand(string? code = null)
    {
        return new RegisterCommand(
            Login: "newuser",
            Password: "SecurePassword123!",
            FullName: "New User",
            CellPhone: "+1234567890",
            Email: "newuser@example.com",
            StoreName: "New Store",
            Code: code);
    }
}
