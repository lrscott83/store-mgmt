using Application.Abstractions.Authentication;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Entities.Plans;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
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
    protected readonly Mock<ICreateOwnerService> MockCreateOwnerService;
    protected readonly Mock<ICreateStoreService> MockCreateStoreService;
    protected readonly Mock<IPlanRepository> MockPlanRepository;
    protected readonly Mock<IReSellerRepository> MockReSellerRepository;
    protected readonly Mock<IReSellerOwnerRepository> MockReSellerOwnerRepository;
    protected readonly Mock<IJwtProvider> MockJwtProvider;
    protected readonly Mock<IAuthTokenConfig> MockAuthTokenConfig;
    protected readonly Mock<IStringLocalizer<I18n>> MockLocalizer;
    protected readonly Mock<ILogger<RegisterCommandHandler>> MockLogger;

    // Test data
    protected readonly Guid TestOwnerId = Guid.NewGuid();
    protected readonly Guid TestTenantId = Guid.NewGuid();
    protected readonly Guid TestStoreId = Guid.NewGuid();
    protected readonly Guid TestUserId = Guid.NewGuid();

    protected readonly User TestUser;
    protected readonly Owner TestOwner;
    protected readonly Store TestStore;
    protected readonly StorePlan TestPlan;

    /// <summary>Module id seeded into <see cref="TestPlan"/> (the default Superior plan).</summary>
    protected const int TestPlanModuleId = 1;

    protected RegisterCommandHandlerTestFixture()
    {
        // Initialize mocks
        MockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        MockCreateOwnerService = new Mock<ICreateOwnerService>();
        MockCreateStoreService = new Mock<ICreateStoreService>();
        MockPlanRepository = new Mock<IPlanRepository>();
        MockReSellerRepository = new Mock<IReSellerRepository>();
        MockReSellerOwnerRepository = new Mock<IReSellerOwnerRepository>();
        MockJwtProvider = new Mock<IJwtProvider>();
        MockAuthTokenConfig = new Mock<IAuthTokenConfig>();
        MockLocalizer = new Mock<IStringLocalizer<I18n>>();
        MockLogger = new Mock<ILogger<RegisterCommandHandler>>();

        // Setup JWT provider to return a mock token
        MockJwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()))
            .Returns("mock-jwt-token");

        // Setup AuthTokenConfig to return a default token lifetime
        MockAuthTokenConfig
            .Setup(x => x.TokenLifetimeDays)
            .Returns(30);

        // Initialize test entities
        TestUser = CreateTestUser();
        TestOwner = CreateTestOwner();
        TestStore = CreateTestStore();
        TestPlan = CreateTestPlan();

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
            MockLocalizer.Object,
            MockCreateOwnerService.Object,
            MockCreateStoreService.Object,
            MockPlanRepository.Object,
            MockJwtProvider.Object,
            MockAuthTokenConfig.Object,
            MockReSellerRepository.Object,
            MockReSellerOwnerRepository.Object,
            MockLogger.Object);
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

        // Plan repository returns the default (Superior) plan with its assigned modules
        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(TestPlan);

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

    private StorePlan CreateTestPlan()
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);
        plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, TestPlanModuleId));
        return plan;
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
