using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Abstractions.Authentication;
using Application.Dtos.Management.StoreUsers;
using Application.Exceptions;
using Application.Features.Management.Users.Queries.ExportOfflineRoster;
using Domain.Entities.Billing;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;
using Xunit;

namespace Application.Tests.Management.Users.Queries.ExportOfflineRoster;

/// <summary>
/// store-list-active-stores: the roster's OfflineRosterUserDto must carry the
/// owner's full store list (with activation flags) for OwnerAdmin rows, so the
/// offline selects and name resolution match the online /me contract.
/// Same mock shape as ExportOfflineRosterQueryHandlerTests (kept separate so
/// the existing file stays untouched).
/// </summary>
public class ExportOfflineRosterStoreListTests
{
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerUserId = Guid.NewGuid();
    private readonly Guid _clerkUserId = Guid.NewGuid();
    private readonly Guid _ownerId = Guid.NewGuid();

    private TestMocks CreateMocks()
    {
        var mocks = new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            StoreUserRepository = new Mock<IStoreUserRepository>(),
            StoreRepository = new Mock<IStoreRepository>(),
            OwnerRepository = new Mock<IOwnerRepository>(),
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
            JwtProvider = new Mock<IJwtProvider>(),
            Localizer = new Mock<IStringLocalizer<I18n>>()
        };

        // SuperAdmin caller — auth path passes; store-list fill is independent of caller.
        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        mocks.JwtProvider
            .Setup(x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns((Guid id, string login, DateTime exp) => $"offline-token-{id:N}");

        mocks.OfflinePreHashProtector
            .Setup(x => x.Unprotect(It.IsAny<string?>(), It.IsAny<Guid>()))
            .Returns((string? envelope, Guid _) => envelope);

        mocks.DateTimeProvider.Setup(c => c.UtcNow)
            .Returns(new DateTimeOffset(DateTime.UtcNow, TimeSpan.Zero));

        // Store under export: active, owned by _ownerId.
        var store = Store.Create($"Store-{Guid.NewGuid():N}", _ownerId, true, _tenantId);
        store.GetType().GetProperty("Id")!.SetValue(store, _storeId);
        mocks.StoreRepository.Setup(x => x.GetStoreByIdAsync(_storeId)).ReturnsAsync(store);

        // Owner check: active owner user.
        var ownerEntity = Domain.Entities.Owners.Owner.Create(_ownerId, _ownerUserId, false, _tenantId, "owner");
        ownerEntity.User = CreateUser(_ownerUserId, "owner-login");
        // Owner check + store-list fill source: the export resolves the owner
        // (with user) twice — once for the inactive-owner guard, once for the
        // store-list owner user id. Both return the same active owner.
        mocks.OwnerRepository.Setup(x => x.GetOwnerIncludingUserByIdAsync(_ownerId, CancellationToken.None)).ReturnsAsync(ownerEntity);

        // No modules / no role features / no allowed features — not under test.
        mocks.StoreModuleRepository.Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(new List<Domain.Entities.StoreModules.StoreModule>());
        mocks.StoreRoleFeatureRepository
            .Setup(x => x.GetStoreRoleFeaturesByUserIdAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<Domain.Entities.StoreRoleFeatures.StoreRoleFeature>());
        mocks.AllowedFeaturesService
            .Setup(x => x.GetAllowedFeatureIdsForUserAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<int>());

        mocks.BillingService.Setup(x => x.GetStoreBillingSummaryAsync(_storeId))
            .ReturnsAsync(new StoreBillingSummary { StoreId = _storeId, PlanType = "Free" });

        mocks.SystemConfigurationRepository.Setup(x => x.GetOfflineRosterTtlDaysAsync())
            .ReturnsAsync(35);

        mocks.OfflineVerifierService.Setup(x => x.CreateVerifier(It.IsAny<string>()))
            .Returns(new OfflineVerifierResult("hash", "salt", 210_000));

        var dek = new byte[32];
        mocks.StoreDataKeyProvider.Setup(x => x.GetDek(_storeId)).Returns(dek);
        mocks.StoreKeyWrapService.Setup(x => x.WrapDek(It.IsAny<string>(), dek))
            .Returns(new WrappedDekResult("wrap", "salt", "iv", 210_000));

        mocks.UserRoleRepository.Setup(x => x.IsSuperAdmin(It.IsAny<Guid>())).ReturnsAsync(false);
        mocks.UserRoleRepository.Setup(x => x.IsStoreAdmin(It.IsAny<Guid>())).ReturnsAsync(false);
        mocks.UserRoleRepository.Setup(x => x.IsReSeller(It.IsAny<Guid>())).ReturnsAsync(false);

        mocks.Localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));
        mocks.Localizer.Setup(x => x["StoreNotFound"]).Returns(new LocalizedString("StoreNotFound", "Store not found"));

        return mocks;
    }

    private static User CreateUser(Guid id, string login)
    {
        var user = User.Create(login, "hash", login, "0000000000", login, Guid.NewGuid());
        user.GetType().GetProperty("Id")!.SetValue(user, id);
        return user;
    }

    private ExportOfflineRosterQueryHandler CreateHandler(TestMocks mocks)
        => new(
            mocks.HttpContextService.Object,
            mocks.StoreUserRepository.Object,
            mocks.StoreRepository.Object,
            mocks.OwnerRepository.Object,
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
            mocks.JwtProvider.Object,
            mocks.Localizer.Object);

    private StoreUser CreateStoreUserRow(Guid userId, string login)
    {
        var su = StoreUser.Create(userId, _storeId, _tenantId);
        su.User = CreateUser(userId, login);
        su.GetType().GetProperty("UserId")!.SetValue(su, userId);
        return su;
    }

    [Fact]
    public async Task Handle_OwnerRowCarriesAllStoresWithFlags()
    {
        var mocks = CreateMocks();

        // The owner's full store list: roster store (active), a second active
        // store, an inactive third — all owned by the same owner user.
        var secondActive = Store.Create($"Second-{Guid.NewGuid():N}", _ownerId, true, _tenantId);
        secondActive.IsActive = true;
        var inactiveThird = Store.Create($"Third-{Guid.NewGuid():N}", _ownerId, true, _tenantId);
        inactiveThird.IsActive = false;
        var rosterStoreActive = mocks.StoreRepository.Setup(x => x.GetStoreByIdAsync(_storeId)).ReturnsAsync(
            Store.Create($"Roster-{Guid.NewGuid():N}", _ownerId, true, _tenantId));
        // Note: GetStoreByIdAsync returns a fresh active store per call — the
        // roster store itself must be ACTIVE for the export to proceed.

        mocks.StoreRepository.Setup(x => x.GetAllStoresByOwnerUserIdAsync(_ownerUserId, null))
            .ReturnsAsync(new List<Store>
            {
                // Recreate the roster store with the fixed _storeId
                RosterStore(),
                secondActive,
                inactiveThird
            });

        // Clerk is isStoreAdmin=false; owner is isStoreAdmin=true.
        mocks.UserRoleRepository.Setup(x => x.IsStoreAdmin(_ownerUserId)).ReturnsAsync(true);
        mocks.UserRoleRepository.Setup(x => x.IsStoreAdmin(_clerkUserId)).ReturnsAsync(false);

        mocks.StoreUserRepository.Setup(x => x.GetStoreUsersByStoreIdAsync(_storeId, true))
            .ReturnsAsync(new List<StoreUser>
            {
                CreateStoreUserRow(_clerkUserId, "clerk-login")
            });

        var handler = CreateHandler(mocks);

        var result = await handler.Handle(new ExportOfflineRosterQuery(_storeId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Users.Should().HaveCount(2); // synthetic owner row + clerk row

        var ownerRow = result.Data.Users.Single(u => u.Id == _ownerUserId);
        ownerRow.StoreList.Should().HaveCount(3);
        var flags = ownerRow.StoreList.ToDictionary(s => s.Id, s => s.IsActive);
        flags[_storeId].Should().BeTrue();
        flags[secondActive.Id].Should().BeTrue();
        flags[inactiveThird.Id].Should().BeFalse();

        var clerkRow = result.Data.Users.Single(u => u.Id == _clerkUserId);
        clerkRow.StoreList.Should().BeEmpty();

        // One owner-list fill per export — no per-user store queries.
        mocks.StoreRepository.Verify(
            x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), null),
            Times.Once);
    }

    private Store RosterStore()
    {
        var s = Store.Create("RosterStore", _ownerId, true, _tenantId);
        s.GetType().GetProperty("Id")!.SetValue(s, _storeId);
        s.IsActive = true;
        return s;
    }

    private class TestMocks
    {
        public Mock<IHttpContextService> HttpContextService { get; set; } = null!;
        public Mock<IStoreUserRepository> StoreUserRepository { get; set; } = null!;
        public Mock<IStoreRepository> StoreRepository { get; set; } = null!;
        public Mock<IOwnerRepository> OwnerRepository { get; set; } = null!;
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
        public Mock<IJwtProvider> JwtProvider { get; set; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; set; } = null!;
    }
}
