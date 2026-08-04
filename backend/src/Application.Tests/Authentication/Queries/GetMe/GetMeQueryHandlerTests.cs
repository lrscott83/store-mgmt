using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Abstractions.Authentication;
using Application.Features.Authentication.Queries.GetMe;
using Application.Services.Tenants;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Moq;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

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
            mocks.DateTimeProvider.Object,
            mocks.TokenBlacklistService.Object);

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
            mocks.DateTimeProvider.Object,
            mocks.TokenBlacklistService.Object);

        var query = new GetMeQuery();

        // Act
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Data.Should().BeNull();
        result.Errors.Should().Contain(e => e.Code == "User.NotFound");
    }

    /// <summary>
    /// Verifies that an inactive user makes the handler return NotFound (ActionCode 404)
    /// and blacklist the current token's jti. Uses a real UserRepository over EF InMemory
    /// (design D4) — pins the BlacklistAsync invocation, which was previously uncovered.
    /// GREEN immediately: this pins existing behavior, it is not a behavior-change RED.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnNotFoundAndBlacklistToken_WhenUserIsInactive()
    {
        // Arrange
        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(false);
        httpContextMock.Setup(x => x.IsOwnerAdmin).Returns(false);
        httpContextMock.Setup(x => x.IsReSeller).Returns(false);
        httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());

        var tenantId = Guid.NewGuid();
        var login = $"inactive_{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, "password-hash", "Inactive User", "0000000000", login, tenantId);
        user.IsActive = false;

        var jti = Guid.NewGuid().ToString();
        httpContextMock.Setup(x => x.UserExternalId).Returns(user.Id.ToString());

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var context = new ApplicationDbContext(options, new TenantIdProvider(new HttpContextAccessor()), httpContextMock.Object);
        context.Set<User>().Add(user);
        await context.SaveChangesAsync();

        var repository = new UserRepository(context);

        httpContextMock.Setup(x => x.AccessToken).Returns(BuildAccessToken(jti));

        var mocks = CreateMocks();
        var handler = new GetMeQueryHandler(
            httpContextMock.Object,
            repository,
            mocks.StoreRoleFeatureRepository.Object,
            mocks.AllowedFeaturesService.Object,
            mocks.StoreModuleRepository.Object,
            mocks.BillingService.Object,
            mocks.DateTimeProvider.Object,
            mocks.TokenBlacklistService.Object);

        var query = new GetMeQuery();

        // Act
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.ActionCode.Should().Be(404);
        result.Errors.Should().ContainSingle(e => e.Code == "Auth.AccountInactive");
        mocks.TokenBlacklistService.Verify(
            x => x.BlacklistAsync(jti, It.IsAny<TimeSpan>()), Times.Once);

        context.Dispose();
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
            DateTimeProvider = new Mock<IDateTimeProvider>(),
            TokenBlacklistService = new Mock<ITokenBlacklistService>()
        };

        mocks.DateTimeProvider.Setup(c => c.UtcNow).Returns(new DateTimeOffset(DateTime.UtcNow, TimeSpan.Zero));

        return mocks;
    }

    /// <summary>
    /// Builds a signed JWT carrying a jti claim and a 1-hour exp, so the handler's
    /// BlacklistCurrentTokenAsync can extract both claims (as in real requests).
    /// </summary>
    private static string BuildAccessToken(string jti)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("unit-test-signing-key-unit-test-signing-key"));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: "test",
            audience: "test",
            claims: [new Claim(JwtRegisteredClaimNames.Jti, jti)],
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
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
        public Mock<ITokenBlacklistService> TokenBlacklistService { get; set; } = null!;
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
