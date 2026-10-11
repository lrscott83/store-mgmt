using Application.Services.Authentication;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Owners;
using Domain.Interfaces.Services.Stores;
using Moq;
using Microsoft.Extensions.Logging;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Base fixture for <see cref="RegisterService"/> — the tests that used to live on
/// RegisterCommandHandler and asserted on plan loading, module ids, store creation and the Gestor
/// link. Those artifacts are built by the service now, so the tests moved with them.
/// <para>
/// The assertions are unchanged in intent; only the seam moved. Where a failure used to be a
/// returned ResponseResult it is now a thrown ApiException carrying the SAME AcctionCode, which is
/// what lets each handler rebuild the identical response.
/// </para>
/// </summary>
public abstract class RegisterServiceTestFixture
{
    // Mock dependencies — exactly what the service injects.
    // store-birth-superior (2026-10-11): IPlanRepository is GONE from the service — the birth plan
    // and its module set are resolved inside CreateStoreService, not here.
    protected readonly Mock<ICreateOwnerService> MockCreateOwnerService;
    protected readonly Mock<ICreateStoreService> MockCreateStoreService;
    protected readonly Mock<IReSellerRepository> MockReSellerRepository;
    protected readonly Mock<IReSellerOwnerRepository> MockReSellerOwnerRepository;
    protected readonly Mock<ILogger<RegisterService>> MockLogger;

    // Test data
    protected readonly Guid TestOwnerId = Guid.NewGuid();
    protected readonly Guid TestTenantId = Guid.NewGuid();
    protected readonly Guid TestStoreId = Guid.NewGuid();
    protected readonly Guid TestUserId = Guid.NewGuid();

    protected readonly User TestUser;
    protected readonly Owner TestOwner;
    protected readonly Store TestStore;

    /// <summary>
    /// The birth plan constant the service no longer resolves itself — pinned here only to keep the
    /// plan/module derivation assertion in <c>CreateStoreServiceTests</c> honest about WHICH plan a
    /// new store is born on (store-birth-superior, 2026-10-11).
    /// </summary>
    protected const int BirthPlanId = (int)StorePlanType.Superior;

    protected RegisterServiceTestFixture()
    {
        MockCreateOwnerService = new Mock<ICreateOwnerService>();
        MockCreateStoreService = new Mock<ICreateStoreService>();
        MockReSellerRepository = new Mock<IReSellerRepository>();
        MockReSellerOwnerRepository = new Mock<IReSellerOwnerRepository>();
        MockLogger = new Mock<ILogger<RegisterService>>();

        TestUser = CreateTestUser();
        TestOwner = CreateTestOwner();
        TestStore = CreateTestStore();

        SetupDefaultSuccessfulScenarios();
    }

    protected RegisterService CreateService()
    {
        return new RegisterService(
            MockCreateOwnerService.Object,
            MockCreateStoreService.Object,
            MockReSellerRepository.Object,
            MockReSellerOwnerRepository.Object,
            MockLogger.Object);
    }

    /// <summary>
    /// The service entry point with the happy-path arguments, so each test only states the
    /// variable part (usually reSellerLogin).
    /// </summary>
    protected Task<Owner> RegisterAsync(
        string storeName = "New Store",
        string? ownerDescription = "Test Owner Description",
        string? reSellerLogin = null,
        CancellationToken cancellationToken = default)
    {
        return CreateService().RegisterAsync(
            login: "newuser",
            password: "SecurePassword123!",
            fullName: "New User",
            cellPhone: "+1234567890",
            email: "newuser@example.com",
            storeName: storeName,
            ownerDescription: ownerDescription,
            reSellerLogin: reSellerLogin,
            cancellationToken: cancellationToken);
    }

    private void SetupDefaultSuccessfulScenarios()
    {
        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>()))
            .ReturnsAsync(TestOwner);

        // store-birth-superior (2026-10-11): the service passes NO module set — the birth plan
        // and its catalog are CreateStoreService's decision.
        MockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<bool>()))
            .ReturnsAsync(TestStore);
    }

    /// <summary>
    /// Creates a test ReSeller for testing referral-code scenarios. Discounts are non-zero so a
    /// link test can prove the snapshot was copied rather than defaulted.
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

    private User CreateTestUser()
    {
        var user = User.Create(
            "testuser",
            "hashedpassword",
            "Test User",
            "+1234567890",
            "test@example.com",
            TestTenantId);

        typeof(Domain.Entities.Users.User)
            .GetProperty("Id")!
            .SetValue(user, TestUserId);

        return user;
    }

    private Owner CreateTestOwner()
    {
        var owner = Owner.Create(TestUserId, false, TestTenantId, "Test Owner Description");

        typeof(Owner)
            .GetProperty("Id")!
            .SetValue(owner, TestOwnerId);

        owner.User = TestUser;

        return owner;
    }

    private Store CreateTestStore()
    {
        // store-birth-superior (2026-10-11): Store.Create's default plan is Superior (3).
        var store = Store.Create(
            "Test Store",
            TestOwnerId,
            true,
            TestTenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));

        typeof(Store)
            .GetProperty("Id")!
            .SetValue(store, TestStoreId);

        return store;
    }
}