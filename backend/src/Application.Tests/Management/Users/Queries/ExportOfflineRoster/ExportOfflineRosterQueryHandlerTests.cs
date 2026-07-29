using Application.Abstractions.Authentication;
using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.Features.Management.Users.Queries.ExportOfflineRoster;
using Domain.Common.Extensions;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;
using System.Runtime.Serialization;
using Xunit;

namespace Application.Tests.Management.Users.Queries.ExportOfflineRoster;

public class ExportOfflineRosterQueryHandlerTests
{
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _userId1 = Guid.NewGuid();
    private readonly Guid _userId2 = Guid.NewGuid();
    private readonly Guid _callerUserId = Guid.NewGuid();

    #region Auth Tests

    [Fact]
    public async Task Handle_ShouldThrowApiException_WhenCallerIsNotSuperAdminOrOwnerAdmin()
    {
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);

        var handler = CreateHandler(mocks);

        var act = () => handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_ShouldThrowApiException_WhenOwnerAdminRequestsForeignStore()
    {
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.UserExternalId).Returns(_callerUserId.ToString());

        // The owned store has a random ID — it won't match _storeId.
        var ownedStore = Store.Create("My Store", Guid.NewGuid(), true, _tenantId);
        mocks.StoreRepository.Setup(x => x.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(_callerUserId))
            .ReturnsAsync(new List<Store> { ownedStore });

        var handler = CreateHandler(mocks);

        var act = () => handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    #endregion

    #region Success Scenarios

    [Fact]
    public async Task Handle_SuperAdmin_ReturnsFullRosterWithTwoUsers()
    {
        var mocks = CreateMocks();
        SetupSuperAdmin(mocks);
        SetupStoreModules(mocks, []);             // no modules for simplicity
        SetupRoleFeatures(mocks, []);             // no role features
        SetupAllowedFeatures(mocks, [1, 2, 3]);    // fixed feature IDs

        // User 1: active SuperAdmin
        var user1 = CreateUser(_userId1, "admin", "hash-admin", "Admin User", true);
        // User 2: inactive plain user
        var user2 = CreateUser(_userId2, "clerk", "hash-clerk", "Clerk User", false);

        var storeUsers = new List<StoreUser>
        {
            CreateStoreUser(user1),
            CreateStoreUser(user2)
        };
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(storeUsers);

        SetupUserRoles(mocks, userId: _userId1, isSuperAdmin: true, isStoreAdmin: false, isReSeller: false);
        SetupUserRoles(mocks, userId: _userId2, isSuperAdmin: false, isStoreAdmin: false, isReSeller: false);

        var fixedVerifier = new OfflineVerifierResult("dGVzdC1oYXNo", "dGVzdC1zYWx0", 210_000);
        mocks.OfflineVerifierService.Setup(x => x.CreateVerifier(It.IsAny<string>()))
            .Returns(fixedVerifier);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();

        var dto = result.Data!;
        dto.FormatVersion.Should().Be(1);
        dto.StoreId.Should().Be(_storeId);
        Guid.TryParse(dto.BundleId, out _).Should().BeTrue();

        var msPerDay = 24 * 60 * 60 * 1000L;
        (dto.ExpiresAt - dto.IssuedAt).Should().Be(35 * msPerDay);

        dto.Users.Should().HaveCount(2);

        // Both users should have a verifier attached
        foreach (var user in dto.Users)
        {
            user.Verifier.Should().NotBeNull();
            user.Verifier.Hash.Should().Be("dGVzdC1oYXNo");
            user.Verifier.Salt.Should().Be("dGVzdC1zYWx0");
            user.Verifier.Iterations.Should().Be(210_000);
        }
    }

    [Fact]
    public async Task Handle_VerifierIsCalledOncePerUser()
    {
        var mocks = CreateMocks();
        SetupSuperAdmin(mocks);
        SetupStoreModules(mocks, []);
        SetupRoleFeatures(mocks, []);
        SetupAllowedFeatures(mocks, []);

        // Set up the verifier mock so it doesn't return null
        var fixedVerifier = new OfflineVerifierResult("hash-1", "salt-1", 210_000);
        mocks.OfflineVerifierService.Setup(x => x.CreateVerifier(It.IsAny<string>()))
            .Returns(fixedVerifier);

        var user1 = CreateUser(_userId1, "u1", "password-hash-1", "User One", true);
        var user2 = CreateUser(_userId2, "u2", "password-hash-2", "User Two", true);

        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(new List<StoreUser>
            {
                CreateStoreUser(user1),
                CreateStoreUser(user2)
            });

        SetupUserRoles(mocks, _userId1, false, false, false);
        SetupUserRoles(mocks, _userId2, false, false, false);

        var handler = CreateHandler(mocks);

        await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        mocks.OfflineVerifierService.Verify(
            x => x.CreateVerifier("password-hash-1"), Times.Once);
        mocks.OfflineVerifierService.Verify(
            x => x.CreateVerifier("password-hash-2"), Times.Once);
        mocks.OfflineVerifierService.Verify(
            x => x.CreateVerifier(It.IsAny<string>()), Times.Exactly(2));
    }

    #endregion

    #region Test Helpers

    private TestMocks CreateMocks()
    {
        return new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            StoreUserRepository = new Mock<IStoreUserRepository>(),
            StoreRepository = new Mock<IStoreRepository>(),
            StoreModuleRepository = new Mock<IStoreModuleRepository>(),
            StoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>(),
            UserRoleRepository = new Mock<IUserRoleRepository>(),
            AllowedFeaturesService = new Mock<IAllowedFeaturesService>(),
            OfflineVerifierService = new Mock<IOfflineVerifierService>(),
            Localizer = new Mock<IStringLocalizer<I18n>>()
        };
    }

    private ExportOfflineRosterQueryHandler CreateHandler(TestMocks mocks)
    {
        mocks.Localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));

        return new ExportOfflineRosterQueryHandler(
            mocks.HttpContextService.Object,
            mocks.StoreUserRepository.Object,
            mocks.StoreRepository.Object,
            mocks.StoreModuleRepository.Object,
            mocks.StoreRoleFeatureRepository.Object,
            mocks.UserRoleRepository.Object,
            mocks.AllowedFeaturesService.Object,
            mocks.OfflineVerifierService.Object,
            mocks.Localizer.Object);
    }

    private static User CreateUser(Guid id, string login, string password, string fullName, bool isActive)
    {
        var user = User.Create(id, login, password, fullName, null, null, Guid.NewGuid());
        user.IsActive = isActive;
        return user;
    }

    private static StoreUser CreateStoreUser(User user)
    {
        var su = StoreUser.Create(user.Id, Guid.NewGuid(), Guid.NewGuid());
        su.User = user;
        return su;
    }

    private void SetupSuperAdmin(TestMocks mocks)
    {
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
    }

    private void SetupStoreModules(TestMocks mocks, List<int> moduleIds)
    {
        var storeModules = moduleIds
            .Select(mid =>
            {
                var sm = (Domain.Entities.StoreModules.StoreModule)FormatterServices
                    .GetUninitializedObject(typeof(Domain.Entities.StoreModules.StoreModule));
                sm.GetType().GetProperty(nameof(sm.ModuleId))!.SetValue(sm, mid);
                return sm;
            })
            .ToList();

        mocks.StoreModuleRepository.Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(storeModules);
    }

    private void SetupRoleFeatures(TestMocks mocks, List<object> features)
    {
        // Return empty by default — role assembly is tested at E2E level
        mocks.StoreRoleFeatureRepository
            .Setup(x => x.GetStoreRoleFeaturesByUserIdAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<Domain.Entities.StoreRoleFeatures.StoreRoleFeature>());
    }

    private void SetupAllowedFeatures(TestMocks mocks, List<int> featureIds)
    {
        mocks.AllowedFeaturesService
            .Setup(x => x.GetAllowedFeatureIdsForUserAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(featureIds);
    }

    private void SetupUserRoles(TestMocks mocks, Guid userId, bool isSuperAdmin, bool isStoreAdmin, bool isReSeller)
    {
        mocks.UserRoleRepository.Setup(x => x.IsSuperAdmin(userId)).ReturnsAsync(isSuperAdmin);
        mocks.UserRoleRepository.Setup(x => x.IsStoreAdmin(userId)).ReturnsAsync(isStoreAdmin);
        mocks.UserRoleRepository.Setup(x => x.IsReSeller(userId)).ReturnsAsync(isReSeller);
    }

    private class TestMocks
    {
        public Mock<IHttpContextService> HttpContextService { get; set; } = null!;
        public Mock<IStoreUserRepository> StoreUserRepository { get; set; } = null!;
        public Mock<IStoreRepository> StoreRepository { get; set; } = null!;
        public Mock<IStoreModuleRepository> StoreModuleRepository { get; set; } = null!;
        public Mock<IStoreRoleFeatureRepository> StoreRoleFeatureRepository { get; set; } = null!;
        public Mock<IUserRoleRepository> UserRoleRepository { get; set; } = null!;
        public Mock<IAllowedFeaturesService> AllowedFeaturesService { get; set; } = null!;
        public Mock<IOfflineVerifierService> OfflineVerifierService { get; set; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; set; } = null!;
    }

    #endregion
}
