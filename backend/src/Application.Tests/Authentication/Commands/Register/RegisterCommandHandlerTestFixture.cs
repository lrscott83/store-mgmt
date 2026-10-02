using Application.Abstractions.Authentication;
using Application.Dtos.Authentication;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Services.Authentication;
using FluentAssertions;
using Moq;
using Application.Features.Authentication.Commands.Register;
using Resources;
using System.Net;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Base fixture for the tests that remain on <see cref="RegisterCommandHandler"/> after the
/// RegisterService extraction.
/// <para>
/// SCOPE CHANGE (register-service): this handler no longer builds artifacts. It owns exactly two
/// things — the single SaveChanges and the JWT. So the fixture mocks
/// <see cref="IRegisterService"/> instead of the four repositories the handler used to inject
/// directly. The tests that asserted on plan loading, module ids, store creation and the Gestor
/// link moved to RegisterServiceTests, where they now assert against the service itself.
/// Nothing was dropped: 31 behaviors moved, 11 stayed.
/// </para>
/// </summary>
public abstract class RegisterCommandHandlerTestFixture
{
    // Mock dependencies — exactly what the handler still injects.
    protected readonly Mock<IApplicationUnitOfWork> MockUnitOfWork;
    protected readonly Mock<IRegisterService> MockRegisterService;
    protected readonly Mock<IJwtProvider> MockJwtProvider;
    protected readonly Mock<IAuthTokenConfig> MockAuthTokenConfig;

    // Test data
    protected readonly Guid TestOwnerId = Guid.NewGuid();
    protected readonly Guid TestTenantId = Guid.NewGuid();
    protected readonly Guid TestStoreId = Guid.NewGuid();
    protected readonly Guid TestUserId = Guid.NewGuid();

    protected readonly User TestUser;
    protected readonly Owner TestOwner;
    protected readonly Store TestStore;

    protected RegisterCommandHandlerTestFixture()
    {
        MockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        MockRegisterService = new Mock<IRegisterService>();
        MockJwtProvider = new Mock<IJwtProvider>();
        MockAuthTokenConfig = new Mock<IAuthTokenConfig>();

        MockJwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()))
            .Returns("mock-jwt-token");

        MockAuthTokenConfig
            .Setup(x => x.TokenLifetimeDays)
            .Returns(30);

        TestUser = CreateTestUser();
        TestOwner = CreateTestOwner();
        TestStore = CreateTestStore();

        SetupDefaultSuccessfulScenarios();
    }

    /// <summary>
    /// Creates the handler instance with all mocked dependencies.
    /// </summary>
    protected RegisterCommandHandler CreateHandler()
    {
        return new RegisterCommandHandler(
            MockUnitOfWork.Object,
            MockRegisterService.Object,
            MockJwtProvider.Object,
            MockAuthTokenConfig.Object);
    }

    /// <summary>
    /// Default successful scenario: the service returns an owner and the single save persists it.
    /// </summary>
    private void SetupDefaultSuccessfulScenarios()
    {
        MockRegisterService
            .Setup(x => x.RegisterAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestOwner);

        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        MockJwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()))
            .Returns("mock-jwt-token-for-testing");
    }

    /// <summary>
    /// Makes the service fail the way a real one does: by throwing ApiException. The handler must
    /// translate it back into the SAME ResponseResult it returned before the extraction, because
    /// AuthController maps every failure ActionCode through a switch whose default arm is also
    /// BadRequest — an escaping exception would flip those failures from HTTP 400 to HTTP 500.
    /// </summary>
    protected void SetupServiceFailure(string actionCode, HttpStatusCode status, string message = "boom")
    {
        MockRegisterService
            .Setup(x => x.RegisterAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ApiException(message, status) { AcctionCode = actionCode });
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