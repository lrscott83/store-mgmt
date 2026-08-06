using Application.Abstractions.Authentication;
using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.Features.Management.Users.Queries.ExportOfflineRoster;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreUsers;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
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
        mocks.StoreRepository.Setup(x => x.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(_callerUserId, null))
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
        SetupBilling(mocks, StoreBillingStatusType.AlDia, nextDueDate: new DateOnly(2026, 8, 15));
        SetupTtl(mocks, 35);

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

        var fixedDek = new byte[32];
        mocks.StoreDataKeyProvider.Setup(x => x.GetDek(_storeId)).Returns(fixedDek);
        mocks.StoreKeyWrapService.Setup(x => x.WrapDek(It.IsAny<string>(), fixedDek))
            .Returns(new WrappedDekResult(WrappedDek: "dGVzdC13cmFwcGVk", WrapSalt: "dGVzdC1zYWx0", WrapIv: "dGVzdC1pdg==", Iterations: 210_000));

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();

        var dto = result.Data!;
        dto.FormatVersion.Should().Be(3);
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

            user.WrappedDek.Should().Be("dGVzdC13cmFwcGVk");
            user.WrapSalt.Should().Be("dGVzdC1zYWx0");
            user.WrapIv.Should().Be("dGVzdC1pdg==");
            user.WrapIterations.Should().Be(210_000);

            // Billing snapshot mirrors the mocked summary
            user.PaymentStatus.Should().Be("AlDia");
            user.IsInTrial.Should().BeFalse();
            user.PaymentDueDate.Should().Be(new DateOnly(2026, 8, 15));
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
        SetupBilling(mocks, StoreBillingStatusType.NoAplica);
        SetupTtl(mocks, 35);

        // Set up the verifier mock so it doesn't return null
        var fixedVerifier = new OfflineVerifierResult("hash-1", "salt-1", 210_000);
        mocks.OfflineVerifierService.Setup(x => x.CreateVerifier(It.IsAny<string>()))
            .Returns(fixedVerifier);

        var fixedDek = new byte[32];
        mocks.StoreDataKeyProvider.Setup(x => x.GetDek(_storeId)).Returns(fixedDek);
        mocks.StoreKeyWrapService.Setup(x => x.WrapDek(It.IsAny<string>(), fixedDek))
            .Returns(new WrappedDekResult(WrappedDek: "wrap-1", WrapSalt: "salt-1", WrapIv: "iv-1", Iterations: 210_000));

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

        mocks.StoreDataKeyProvider.Verify(x => x.GetDek(_storeId), Times.Once);
        mocks.StoreKeyWrapService.Verify(x => x.WrapDek(It.IsAny<string>(), It.IsAny<byte[]>()), Times.Exactly(2));
    }

    [Fact]
    public async Task Handle_NullPreHash_EmitsNullVerifierAndSkipsCreateVerifierAndWrapDek()
    {
        var mocks = CreateMocks();
        SetupSuperAdmin(mocks);
        SetupStoreModules(mocks, []);
        SetupRoleFeatures(mocks, []);
        SetupAllowedFeatures(mocks, []);
        SetupBilling(mocks, StoreBillingStatusType.NoAplica);
        SetupTtl(mocks, 35);

        var fixedDek = new byte[32];
        mocks.StoreDataKeyProvider.Setup(x => x.GetDek(_storeId)).Returns(fixedDek);

        // Never logged in / never had a password set since this change shipped —
        // OfflinePasswordPreHash is null, and Unprotect(null, ...) returns null (identity default).
        var user = CreateUser(_userId1, "no-prehash-u", offlinePreHash: null, "No PreHash User", true);
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(new List<StoreUser> { CreateStoreUser(user) });
        SetupUserRoles(mocks, _userId1, isSuperAdmin: false, isStoreAdmin: false, isReSeller: false);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        var rosterUser = result.Data!.Users.Single();
        rosterUser.Verifier.Should().BeNull();
        rosterUser.WrappedDek.Should().BeEmpty();
        rosterUser.WrapSalt.Should().BeEmpty();
        rosterUser.WrapIv.Should().BeEmpty();
        rosterUser.WrapIterations.Should().Be(0);

        mocks.OfflineVerifierService.Verify(x => x.CreateVerifier(It.IsAny<string>()), Times.Never);
        mocks.StoreKeyWrapService.Verify(x => x.WrapDek(It.IsAny<string>(), It.IsAny<byte[]>()), Times.Never);
    }

    [Fact]
    public async Task Handle_VencidoStore_ExportsOnlyPriceIncludedModules()
    {
        var mocks = CreateMocks();
        SetupSuperAdmin(mocks);
        // Free (PriceIncluded) + paid module — both present on the store
        SetupStoreModules(mocks, [(7, true), (6, false)]);
        SetupRoleFeatures(mocks, []);
        SetupAllowedFeatures(mocks, [1, 2, 3]);
        SetupBilling(mocks, StoreBillingStatusType.Vencido);
        SetupTtl(mocks, 35);

        var user = CreateUser(_userId1, "vencido-u", "hash", "Vencido User", true);
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(new List<StoreUser> { CreateStoreUser(user) });
        SetupUserRoles(mocks, _userId1, isSuperAdmin: false, isStoreAdmin: false, isReSeller: false);
        SetupVerifierAndWrap(mocks);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        result.Data!.Users.Should().HaveCount(1);
        result.Data.Users.Single().StoreModuleIds.Should().Equal(7);   // only PriceIncluded survives the gate
    }

    [Fact]
    public async Task Handle_AlDiaStore_ExportsAllModules()
    {
        var mocks = CreateMocks();
        SetupSuperAdmin(mocks);
        SetupStoreModules(mocks, [(7, true), (6, false)]);
        SetupRoleFeatures(mocks, []);
        SetupAllowedFeatures(mocks, [1, 2, 3]);
        SetupBilling(mocks, StoreBillingStatusType.AlDia);
        SetupTtl(mocks, 35);

        var user = CreateUser(_userId1, "aldia-u", "hash", "AlDia User", true);
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(new List<StoreUser> { CreateStoreUser(user) });
        SetupUserRoles(mocks, _userId1, isSuperAdmin: false, isStoreAdmin: false, isReSeller: false);
        SetupVerifierAndWrap(mocks);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        result.Data!.Users.Single().StoreModuleIds.Should().Equal(7, 6);   // gate leaves all modules
    }

    [Fact]
    public async Task Handle_NoAplicaStore_ExportsAllModules()
    {
        var mocks = CreateMocks();
        SetupSuperAdmin(mocks);
        SetupStoreModules(mocks, [(7, true), (6, false)]);
        SetupRoleFeatures(mocks, []);
        SetupAllowedFeatures(mocks, [1, 2, 3]);
        SetupBilling(mocks, StoreBillingStatusType.NoAplica);
        SetupTtl(mocks, 35);

        var user = CreateUser(_userId1, "noaplica-u", "hash", "NoAplica User", true);
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(new List<StoreUser> { CreateStoreUser(user) });
        SetupUserRoles(mocks, _userId1, isSuperAdmin: false, isStoreAdmin: false, isReSeller: false);
        SetupVerifierAndWrap(mocks);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        result.Data!.Users.Single().StoreModuleIds.Should().Equal(7, 6);   // never-started billing keeps every module
    }

    [Fact]
    public async Task Handle_ConfiguredTtlAndVersion3_AppliesConfiguredTtl()
    {
        var pinnedNow = new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero);
        var mocks = CreateMocks();
        SetupSuperAdmin(mocks);
        SetupStoreModules(mocks, []);
        SetupRoleFeatures(mocks, []);
        SetupAllowedFeatures(mocks, []);
        SetupBilling(mocks, StoreBillingStatusType.NoAplica);
        SetupTtl(mocks, 7);
        mocks.DateTimeProvider.Setup(x => x.UtcNow).Returns(pinnedNow);

        var user = CreateUser(_userId1, "ttl-u", "hash", "TTL User", true);
        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(new List<StoreUser> { CreateStoreUser(user) });
        SetupUserRoles(mocks, _userId1, isSuperAdmin: false, isStoreAdmin: false, isReSeller: false);
        SetupVerifierAndWrap(mocks);

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        var dto = result.Data!;
        dto.FormatVersion.Should().Be(3);
        dto.IssuedAt.Should().Be(pinnedNow.ToUnixTimeMilliseconds());

        var msPerDay = 24 * 60 * 60 * 1000L;
        (dto.ExpiresAt - dto.IssuedAt).Should().Be(7 * msPerDay);
        dto.ExpiresAt.Should().Be(pinnedNow.AddDays(7).ToUnixTimeMilliseconds());
    }

    #endregion

    #region Test Helpers

    private TestMocks CreateMocks()
    {
        var mocks = new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            StoreUserRepository = new Mock<IStoreUserRepository>(),
            StoreRepository = new Mock<IStoreRepository>(),
            StoreModuleRepository = new Mock<IStoreModuleRepository>(),
            StoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>(),
            UserRoleRepository = new Mock<IUserRoleRepository>(),
            AllowedFeaturesService = new Mock<IAllowedFeaturesService>(),
            OfflineVerifierService = new Mock<IOfflineVerifierService>(),
            StoreKeyWrapService = new Mock<IStoreKeyWrapService>(),
            StoreDataKeyProvider = new Mock<IStoreDataKeyProvider>(),
            OfflinePreHashProtector = new Mock<IOfflinePreHashProtector>(),
            DateTimeProvider = new Mock<IDateTimeProvider>(),
            SystemConfigurationRepository = new Mock<ISystemConfigurationRepository>(),
            BillingService = new Mock<IBillingService>(),
            Localizer = new Mock<IStringLocalizer<I18n>>()
        };

        // Default: Unprotect passes the envelope through unchanged (identity) — in these tests
        // "envelope" IS the pre-hash (Protect/encryption is exercised separately in
        // OfflinePreHashProtectorTests). Tests that need a null pre-hash override this per-user.
        mocks.OfflinePreHashProtector
            .Setup(x => x.Unprotect(It.IsAny<string?>(), It.IsAny<Guid>()))
            .Returns((string? envelope, Guid _) => envelope);

        return mocks;
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
            mocks.StoreKeyWrapService.Object,
            mocks.StoreDataKeyProvider.Object,
            mocks.OfflinePreHashProtector.Object,
            mocks.DateTimeProvider.Object,
            mocks.SystemConfigurationRepository.Object,
            mocks.BillingService.Object,
            mocks.Localizer.Object);
    }

    /// <summary>
    /// <paramref name="offlinePreHash"/> stands in for the persisted, decrypted
    /// <see cref="User.OfflinePasswordPreHash"/> — with the default identity Unprotect setup in
    /// <see cref="CreateMocks"/>, whatever is set here is exactly what reaches
    /// <see cref="IOfflineVerifierService.CreateVerifier"/> / <see cref="IStoreKeyWrapService.WrapDek"/>.
    /// Pass <see langword="null"/> to exercise the "no pre-hash yet" export path (R5/R12).
    /// </summary>
    private static User CreateUser(Guid id, string login, string? offlinePreHash, string fullName, bool isActive)
    {
        var user = User.Create(id, login, "argon2id-placeholder-hash", fullName, null, null, Guid.NewGuid());
        user.IsActive = isActive;
        user.OfflinePasswordPreHash = offlinePreHash;
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

    private void SetupStoreModules(TestMocks mocks, params (int ModuleId, bool PriceIncluded)[] modules)
    {
        // Real StoreModule + Module objects: the handler maps sm.Module into FilterForBilling.
        var storeModules = modules
            .Select(m =>
            {
                var module = Module.Create(m.ModuleId, $"Module-{m.ModuleId}", order: 0, m.PriceIncluded,
                    price: 0, availableToStore: true, isActive: true);
                var sm = StoreModule.Create(_storeId, m.ModuleId, price: 0, modulePriceIncluded: m.PriceIncluded,
                    modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, _tenantId);
                sm.Module = module;
                return sm;
            })
            .ToList();

        mocks.StoreModuleRepository.Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(storeModules);
    }

    private void SetupBilling(TestMocks mocks, StoreBillingStatusType status, DateOnly? nextDueDate = null, bool isInTrial = false)
    {
        mocks.BillingService.Setup(x => x.GetStoreBillingSummaryAsync(_storeId))
            .ReturnsAsync(new StoreBillingSummary
            {
                StoreId = _storeId,
                Status = status,
                NextDueDate = nextDueDate,
                IsInTrial = isInTrial
            });
    }

    private void SetupTtl(TestMocks mocks, int ttlDays)
    {
        mocks.SystemConfigurationRepository.Setup(x => x.GetOfflineRosterTtlDaysAsync())
            .ReturnsAsync(ttlDays);
    }

    private void SetupVerifierAndWrap(TestMocks mocks)
    {
        var fixedVerifier = new OfflineVerifierResult("dGVzdC1oYXNo", "dGVzdC1zYWx0", 210_000);
        mocks.OfflineVerifierService.Setup(x => x.CreateVerifier(It.IsAny<string>()))
            .Returns(fixedVerifier);

        var fixedDek = new byte[32];
        mocks.StoreDataKeyProvider.Setup(x => x.GetDek(_storeId)).Returns(fixedDek);
        mocks.StoreKeyWrapService.Setup(x => x.WrapDek(It.IsAny<string>(), fixedDek))
            .Returns(new WrappedDekResult(WrappedDek: "dGVzdC13cmFwcGVk", WrapSalt: "dGVzdC1zYWx0", WrapIv: "dGVzdC1pdg==", Iterations: 210_000));
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
        public Mock<IStoreKeyWrapService> StoreKeyWrapService { get; set; } = null!;
        public Mock<IStoreDataKeyProvider> StoreDataKeyProvider { get; set; } = null!;
        public Mock<IOfflinePreHashProtector> OfflinePreHashProtector { get; set; } = null!;
        public Mock<IDateTimeProvider> DateTimeProvider { get; set; } = null!;
        public Mock<ISystemConfigurationRepository> SystemConfigurationRepository { get; set; } = null!;
        public Mock<IBillingService> BillingService { get; set; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; set; } = null!;
    }

    #endregion
}
