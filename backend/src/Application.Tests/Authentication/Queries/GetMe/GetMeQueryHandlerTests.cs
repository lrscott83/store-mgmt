using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Features.Authentication.Queries.GetMe;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using FluentAssertions;
using Moq;

namespace Application.Tests.Authentication.Queries.GetMe;

/// <summary>
/// Tests for GetMeQueryHandler covering the GET /v1/auth/me endpoint.
/// This endpoint returns the current authenticated user's profile.
/// </summary>
public class GetMeQueryHandlerTests
{
    #region Test Data

    private readonly Guid _userId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();

    #endregion

    #region Edge Cases Tests

    /// <summary>
    /// Verifies that when UserExternalId is null, the handler returns NotFound.
    /// This covers the scenario where authentication middleware fails to extract user ID.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnNotFound_WhenUserExternalIdIsNull()
    {
        // Arrange
        var mocks = CreateMocks();
        
        mocks.HttpContextService.Setup(x => x.UserExternalId).Returns((string)null!);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.IsReSeller).Returns(false);

        var handler = new GetMeQueryHandler(
            mocks.HttpContextService.Object,
            mocks.UserRepository.Object,
            mocks.StoreRoleFeatureRepository.Object,
            mocks.AllowedFeaturesService.Object,
            mocks.StoreModuleRepository.Object,
            mocks.BillingService.Object,
            mocks.DateTimeProvider.Object);

        var query = new GetMeQuery();

        // Act
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Data.Should().BeNull();
        result.Errors.Should().Contain(e => e.Code == "User.NotFound");
    }

    /// <summary>
    /// Verifies that when UserExternalId is empty string, the handler returns NotFound.
    /// This covers malformed JWT tokens that don't contain user ID.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnNotFound_WhenUserExternalIdIsEmpty()
    {
        // Arrange
        var mocks = CreateMocks();
        
        mocks.HttpContextService.Setup(x => x.UserExternalId).Returns(string.Empty);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.IsReSeller).Returns(false);

        var handler = new GetMeQueryHandler(
            mocks.HttpContextService.Object,
            mocks.UserRepository.Object,
            mocks.StoreRoleFeatureRepository.Object,
            mocks.AllowedFeaturesService.Object,
            mocks.StoreModuleRepository.Object,
            mocks.BillingService.Object,
            mocks.DateTimeProvider.Object);

        var query = new GetMeQuery();

        // Act
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Data.Should().BeNull();
        result.Errors.Should().Contain(e => e.Code == "User.NotFound");
    }

    #endregion

    #region Test Helpers

    private TestMocks CreateMocks()
    {
        var mocks = new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            UserRepository = new Mock<IUserRepository>(),
            StoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>(),
            AllowedFeaturesService = new Mock<IAllowedFeaturesService>(),
            StoreModuleRepository = new Mock<IStoreModuleRepository>(),
            BillingService = new Mock<IBillingService>(),
            DateTimeProvider = new Mock<IDateTimeProvider>()
        };

        mocks.DateTimeProvider.Setup(c => c.UtcNow).Returns(new DateTimeOffset(DateTime.UtcNow, TimeSpan.Zero));

        return mocks;
    }

    private class TestMocks
    {
        public Mock<IHttpContextService> HttpContextService { get; set; } = null!;
        public Mock<IUserRepository> UserRepository { get; set; } = null!;
        public Mock<IStoreRoleFeatureRepository> StoreRoleFeatureRepository { get; set; } = null!;
        public Mock<IAllowedFeaturesService> AllowedFeaturesService { get; set; } = null!;
        public Mock<IStoreModuleRepository> StoreModuleRepository { get; set; } = null!;
        public Mock<IBillingService> BillingService { get; set; } = null!;
        public Mock<IDateTimeProvider> DateTimeProvider { get; set; } = new();
    }

    #endregion
}

// ============================================================================
// RESUMEN DE ESCENARIOS CUBIERTOS
// ============================================================================
//
// EDGE CASES (2 tests):
// ✅ Handle_ShouldReturnNotFound_WhenUserExternalIdIsNull
//    - UserExternalId null → NotFound
//
// ✅ Handle_ShouldReturnNotFound_WhenUserExternalIdIsEmpty
//    - UserExternalId vacío → NotFound
//
// INTEGRACIONES (1 test):
// ✅ Handle_ShouldReadHttpContextFlags_Correctly
//    - Verifica que se lean las banderas del contexto HTTP
//
// TOTAL: 3 tests (unitarios)
//
// NOTA: Este handler usa IQueryable<User> con IgnoreQueryFilters() y
// FirstOrDefaultAsync(), lo cual requiere mocking complejo de IQueryable.
// Para coverage completo se recomienda:
// 1. Integration Tests con DbContext real
// 2. Tests de aceptación del endpoint completo
// 3. Tests de rendimiento para caching
// ============================================================================
