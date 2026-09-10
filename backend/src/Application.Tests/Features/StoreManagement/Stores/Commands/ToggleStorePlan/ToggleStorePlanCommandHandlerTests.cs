using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.ToggleStorePlan;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.ToggleStorePlan
{
    /// <summary>
    /// Unit tests for ToggleStorePlanCommandHandler (owner-plan-change aligned contract):
    /// - Direction derives from StorePlanId: Gratis → Pago, non-Gratis → Gratis
    /// - PaymentStartDate (billing anchor) is NEVER written — kept, never nulled
    /// - Free→Paid activates ALL paid modules + StoreRoleFeatures; Paid→Free soft-deletes them
    /// - Override rule: Free→Paid overdue → NextDueDateOverride = today; Paid→Free → cleared
    /// - Preconditions: inactive store / inactive owner user → 400; ReSeller non-owner → 400
    /// - Idempotent no-op when already on the target plan
    /// </summary>
    public class ToggleStorePlanCommandHandlerTests
    {
        private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
        private readonly Mock<IStoreRepository> _mockStoreRepository;
        private readonly Mock<IStoreModuleRepository> _mockStoreModuleRepository;
        private readonly Mock<IModuleRepository> _mockModuleRepository;
        private readonly Mock<IFeatureRepository> _mockFeatureRepository;
        private readonly Mock<IStoreRoleFeatureRepository> _mockStoreRoleFeatureRepository;
        private readonly Mock<IStoreRoleFeatureGenerator> _mockStoreRoleFeaturesGenerator;
        private readonly Mock<ISystemConfigurationRepository> _mockSystemConfigurationRepository;
        private readonly Mock<IStorePaymentRepository> _mockStorePaymentRepository;
        private readonly Mock<IHttpContextService> _mockHttpContextService;
        private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
        private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;

        private readonly Guid _storeId = Guid.NewGuid();
        private readonly Guid _tenantId = Guid.NewGuid();
        private readonly Guid _ownerUserId = Guid.NewGuid();
        private readonly Guid _reSellerUserId = Guid.NewGuid();

        private static readonly DateTimeOffset FixedNow = new(2026, 7, 15, 0, 0, 0, TimeSpan.Zero);
        private static readonly DateOnly FixedToday = DateOnly.FromDateTime(FixedNow.UtcDateTime);

        public ToggleStorePlanCommandHandlerTests()
        {
            _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
            _mockStoreRepository = new Mock<IStoreRepository>();
            _mockStoreModuleRepository = new Mock<IStoreModuleRepository>();
            _mockModuleRepository = new Mock<IModuleRepository>();
            _mockFeatureRepository = new Mock<IFeatureRepository>();
            _mockStoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>();
            _mockStoreRoleFeaturesGenerator = new Mock<IStoreRoleFeatureGenerator>();
            _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();
            _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
            _mockHttpContextService = new Mock<IHttpContextService>();
            _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
            _mockDateTimeProvider = new Mock<IDateTimeProvider>();

            _mockLocalizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "UserNotFound"));
            _mockLocalizer.Setup(x => x["StoreNotFound"]).Returns(new LocalizedString("StoreNotFound", "StoreNotFound"));
            _mockLocalizer.Setup(x => x["StoreInactive"]).Returns(new LocalizedString("StoreInactive", "StoreInactive"));
            _mockLocalizer.Setup(x => x["OwnerUserInactive"]).Returns(new LocalizedString("OwnerUserInactive", "OwnerUserInactive"));

            _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(FixedNow);

            _mockUnitOfWork
                .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
                .ReturnsAsync(1);

            // Default: trial 1 month, no previous payments.
            _mockSystemConfigurationRepository
                .Setup(x => x.GetTestingPeriodInMonthsAsync())
                .ReturnsAsync(1);
            _mockStorePaymentRepository
                .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
                .ReturnsAsync((StorePayment?)null);
        }

        private ToggleStorePlanCommandHandler CreateHandler()
            => new(
                _mockUnitOfWork.Object,
                _mockStoreRepository.Object,
                _mockStoreModuleRepository.Object,
                _mockModuleRepository.Object,
                _mockFeatureRepository.Object,
                _mockStoreRoleFeatureRepository.Object,
                _mockStoreRoleFeaturesGenerator.Object,
                _mockSystemConfigurationRepository.Object,
                _mockStorePaymentRepository.Object,
                _mockHttpContextService.Object,
                _mockLocalizer.Object,
                _mockDateTimeProvider.Object);

        // ── Builders ───────────────────────────────────────────────────────

        private static User CreateActiveUser(Guid userId, Guid tenantId)
        {
            var user = User.Create(userId, "owner", "pass", "Owner User", null, null, tenantId);
            user.IsActive = true;
            return user;
        }

        private Owner CreateActiveOwner()
        {
            var owner = Owner.Create(_ownerUserId, guest: false, _tenantId, "Test Owner");
            owner.User = CreateActiveUser(_ownerUserId, _tenantId);
            return owner;
        }

        private Store CreateStore(DateOnly? paymentStartDate = null, bool isActive = true, Owner? owner = null)
        {
            var store = Store.Create("Test Store", Guid.NewGuid(), true, _tenantId, paymentStartDate);
            typeof(Store).GetProperty("Id")!.SetValue(store, _storeId);
            store.Owner = owner ?? CreateActiveOwner();
            store.IsActive = isActive;
            store.StoreModules = new List<StoreModule>();
            return store;
        }

        private static StoreModule CreateFreeModule(Guid storeId, int moduleId, Guid tenantId)
            => StoreModule.Create(storeId, moduleId, price: 0f, modulePriceIncluded: true,
                modulePrice: 0f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f, tenantId);

        private static StoreModule CreatePaidModule(Guid storeId, int moduleId, float price, Guid tenantId, bool isActive = true)
        {
            var sm = StoreModule.Create(storeId, moduleId, price, modulePriceIncluded: false,
                modulePrice: price, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f, tenantId);
            sm.IsActive = isActive;
            return sm;
        }

        private static Module CreatePaidCatalogModule(int moduleId, float price)
            => Module.Create(moduleId, $"Module-{moduleId}", order: 1, priceIncluded: false, price,
                discountPrice: 0f, percentDiscountPrice: 0f, availableToStore: true, isActive: true);

        // ── Arrange helpers ────────────────────────────────────────────────

        private void ArrangeSuperAdmin()
        {
            _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
            _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);
        }

        private void ArrangeReSeller(bool ownsStore)
        {
            _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
            _mockHttpContextService.Setup(x => x.IsReSeller).Returns(true);
            _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_reSellerUserId.ToString());
            _mockStoreRepository
                .Setup(x => x.IsStoreOwnedByReSellerUserAsync(_storeId, _reSellerUserId))
                .ReturnsAsync(ownsStore);
        }

        private void ArrangeStoreFetch(Store store)
        {
            _mockStoreRepository
                .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(_storeId))
                .ReturnsAsync(store);
            _mockStoreRepository
                .Setup(x => x.UpdateAsync(It.IsAny<Store>()))
                .ReturnsAsync(true);
        }

        private void ArrangeEmptyFeatureBookkeeping()
        {
            _mockFeatureRepository
                .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.IsAny<List<int>>()))
                .ReturnsAsync(new List<int>());
            _mockStoreRoleFeaturesGenerator
                .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
                .ReturnsAsync(new List<StoreRoleFeature>());
            _mockStoreRoleFeatureRepository
                .Setup(x => x.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
                .ReturnsAsync(new List<StoreRoleFeature>());
            _mockStoreRoleFeatureRepository
                .Setup(x => x.GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<List<int>>()))
                .ReturnsAsync(new List<StoreRoleFeature>());
        }

        // ── Direction from StorePlanId ──────────────────────────────────────

        [Fact]
        public async Task Handle_freeToPaid_writesStorePlanId_keepsAnchor_andActivatesPaidModules()
        {
            // Arrange: store on Gratis with a null-anchored clock is legacy — a REAL free
            // store carries an anchor since creation. Direction must come from StorePlanId.
            var anchor = new DateOnly(2026, 3, 10);
            var store = CreateStore(paymentStartDate: anchor);
            store.StorePlanId = (int)StorePlanType.Gratis;
            store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);
            ArrangeEmptyFeatureBookkeeping();

            // Catalog: one free module (already active) + two paid modules (1 new, 1 soft-deleted).
            var catalog = new List<Module>
            {
                Module.Create(1, "Free", 0, priceIncluded: true, 0f, 0f, 0f, true, true),
                CreatePaidCatalogModule(2, 100f),
                CreatePaidCatalogModule(3, 200f),
            };
            _mockModuleRepository.Setup(x => x.GetAvailableModulesToStore()).ReturnsAsync(catalog);

            store.StoreModules.Add(CreatePaidModule(_storeId, moduleId: 3, price: 200f, _tenantId, isActive: false));

            _mockStoreModuleRepository
                .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
                .ReturnsAsync(store.StoreModules.ToList());
            StoreModule? insertedPaidModule = null;
            _mockStoreModuleRepository
                .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
                .Callback<StoreModule>(sm => insertedPaidModule = sm)
                .ReturnsAsync((StoreModule sm) => sm);
            _mockStoreModuleRepository
                .Setup(x => x.UpdateAsync(It.IsAny<StoreModule>()))
                .ReturnsAsync(true);

            var handler = CreateHandler();

            // Act
            var result = await handler.Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            // Assert
            result.Succeeded.Should().BeTrue();
            result.Data.Should().BeTrue();
            store.StorePlanId.Should().Be((int)StorePlanType.Pago, "direction derives from StorePlanId");
            store.PaymentStartDate.Should().Be(anchor, "the billing anchor is sacred — never rewritten");
            store.NextDueDateOverride.Should().Be(FixedToday,
                "anchor 2026-03-10 + trial 1 → due 2026-05-10, long overdue → pinned to today");

            // New paid module inserted (module 2).
            insertedPaidModule.Should().NotBeNull();
            insertedPaidModule!.ModuleId.Should().Be(2);
            insertedPaidModule.IsActive.Should().BeTrue();
            insertedPaidModule.Price.Should().Be(100f);
            // Soft-deleted paid module reactivated, no insert (module 3).
            _mockStoreModuleRepository.Verify(x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 3 && sm.IsActive)), Times.Once);
            _mockStoreModuleRepository.Verify(x => x.AddAsync(It.IsAny<StoreModule>()), Times.Once);
            // Free modules untouched.
            store.StoreModules.Single(sm => sm.ModuleId == 1).IsActive.Should().BeTrue();
        }

        [Fact]
        public async Task Handle_freeToPaid_nullAnchor_keepsNull_andSkipsOverride()
        {
            // Legacy row with null anchor: direction still from StorePlanId; the anchor
            // must STAY null (toggle never fabricates a clock) and no override is pinned.
            var store = CreateStore(paymentStartDate: null);
            store.StorePlanId = (int)StorePlanType.Gratis;
            store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);
            ArrangeEmptyFeatureBookkeeping();
            _mockModuleRepository
                .Setup(x => x.GetAvailableModulesToStore())
                .ReturnsAsync(new List<Module> { Module.Create(1, "Free", 0, priceIncluded: true, 0f, 0f, 0f, true, true) });
            _mockStoreModuleRepository
                .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
                .ReturnsAsync(store.StoreModules.ToList());
            _mockStoreModuleRepository
                .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
                .ReturnsAsync((StoreModule sm) => sm);

            var result = await CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            store.StorePlanId.Should().Be((int)StorePlanType.Pago);
            store.PaymentStartDate.Should().BeNull("legacy null anchor stays null");
            store.NextDueDateOverride.Should().BeNull("no clock → no pin");
        }

        [Fact]
        public async Task Handle_freeToPaid_generatesStoreRoleFeatures_forInsertedModules()
        {
            var anchor = FixedToday.AddDays(-10);
            var store = CreateStore(paymentStartDate: anchor);
            store.StorePlanId = (int)StorePlanType.Gratis;
            store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);

            var catalog = new List<Module> { CreatePaidCatalogModule(2, 100f) };
            _mockModuleRepository.Setup(x => x.GetAvailableModulesToStore()).ReturnsAsync(catalog);

            _mockStoreModuleRepository
                .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
                .ReturnsAsync(store.StoreModules.ToList());
            _mockStoreModuleRepository
                .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
                .ReturnsAsync((StoreModule sm) => sm);

            _mockFeatureRepository
                .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.Is<List<int>>(ids => ids.SequenceEqual(new List<int> { 2 }))))
                .ReturnsAsync(new List<int> { 100, 101 });
            _mockStoreRoleFeaturesGenerator
                .Setup(x => x.GenerateStoreRoleFeaturesAsync(_storeId, _tenantId, It.IsAny<IEnumerable<int>>()))
                .ReturnsAsync(new List<StoreRoleFeature>
                {
                    StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 100, _tenantId),
                    StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 101, _tenantId),
                });
            _mockStoreRoleFeatureRepository
                .Setup(x => x.AddAsync(It.IsAny<StoreRoleFeature>()))
                .ReturnsAsync((StoreRoleFeature f) => f);

            var result = await CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            _mockStoreRoleFeaturesGenerator.Verify(
                x => x.GenerateStoreRoleFeaturesAsync(_storeId, _tenantId, It.IsAny<IEnumerable<int>>()), Times.Once);
            _mockStoreRoleFeatureRepository.Verify(
                x => x.AddAsync(It.Is<StoreRoleFeature>(f => f.FeatureId == 100)), Times.Once);
            _mockStoreRoleFeatureRepository.Verify(
                x => x.AddAsync(It.Is<StoreRoleFeature>(f => f.FeatureId == 101)), Times.Once);
        }

        // ── Paid → Free ─────────────────────────────────────────────────────

        [Fact]
        public async Task Handle_paidToFree_writesGratisPlanId_keepsAnchor_clearsOverride_andSoftDeletesPaidModules()
        {
            // Arrange: a paid store whose clock started long ago — toggle must keep the
            // anchor, flip StorePlanId to Gratis, clear any override, and drop paid modules.
            var anchor = new DateOnly(2026, 3, 10);
            var store = CreateStore(paymentStartDate: anchor);
            store.StorePlanId = (int)StorePlanType.Pago;
            store.NextDueDateOverride = new DateOnly(2026, 7, 1);
            store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));
            var paidActive = CreatePaidModule(_storeId, moduleId: 2, price: 100f, _tenantId);
            var paidAlsoActive = CreatePaidModule(_storeId, moduleId: 3, price: 200f, _tenantId);
            store.StoreModules.Add(paidActive);
            store.StoreModules.Add(paidAlsoActive);

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);
            ArrangeEmptyFeatureBookkeeping();

            _mockStoreModuleRepository
                .Setup(x => x.UpdateAsync(It.IsAny<StoreModule>()))
                .ReturnsAsync(true);

            var features = new List<StoreRoleFeature>
            {
                StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 100, _tenantId),
                StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 101, _tenantId),
            };
            _mockStoreRoleFeatureRepository
                .Setup(x => x.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(_storeId, It.Is<List<int>>(ids => ids.Contains(2) && ids.Contains(3))))
                .ReturnsAsync(features);

            // Act
            var result = await CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            // Assert
            result.Succeeded.Should().BeTrue();
            store.StorePlanId.Should().Be((int)StorePlanType.Gratis);
            store.PaymentStartDate.Should().Be(anchor, "the anchor is NEVER nulled");
            store.NextDueDateOverride.Should().BeNull("downgrading clears any pinned due date");

            _mockStoreModuleRepository.Verify(x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 2 && !sm.IsActive)), Times.Once);
            _mockStoreModuleRepository.Verify(x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 3 && !sm.IsActive)), Times.Once);
            _mockStoreModuleRepository.Verify(x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 1)), Times.Never,
                "free modules are untouched");
            _mockStoreRoleFeatureRepository.Verify(
                x => x.UpdateAsync(It.Is<StoreRoleFeature>(f => f.FeatureId == 100 && !f.IsActive)), Times.Once);
            _mockStoreRoleFeatureRepository.Verify(
                x => x.UpdateAsync(It.Is<StoreRoleFeature>(f => f.FeatureId == 101 && !f.IsActive)), Times.Once);
        }

        // ── Preconditions / guards ──────────────────────────────────────────

        [Fact]
        public async Task Handle_inactiveStore_throwsStoreInactive()
        {
            var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10), isActive: false);
            store.StorePlanId = (int)StorePlanType.Gratis;

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);

            var act = () => CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            await act.Should().ThrowAsync<ApiException>()
                .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task Handle_inactiveOwnerUser_throwsOwnerUserInactive()
        {
            var owner = CreateActiveOwner();
            owner.User.IsActive = false;
            var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10), owner: owner);
            store.StorePlanId = (int)StorePlanType.Gratis;

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);

            var act = () => CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            await act.Should().ThrowAsync<ApiException>()
                .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task Handle_resellerNotOwningStore_throwsStoreNotFound()
        {
            var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10));
            store.StorePlanId = (int)StorePlanType.Gratis;

            ArrangeReSeller(ownsStore: false);
            ArrangeStoreFetch(store);

            var act = () => CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            await act.Should().ThrowAsync<ApiException>()
                .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
        }

        // ── No-op ───────────────────────────────────────────────────────────

        [Fact]
        public async Task Handle_paidToFree_withNoActivePaidModules_isNoOpOnModules()
        {
            var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10));
            store.StorePlanId = (int)StorePlanType.Pago;
            store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);
            ArrangeEmptyFeatureBookkeeping();

            _mockStoreModuleRepository
                .Setup(x => x.UpdateAsync(It.IsAny<StoreModule>()))
                .ReturnsAsync(true);

            var result = await CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            store.StorePlanId.Should().Be((int)StorePlanType.Gratis);
            _mockStoreModuleRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreModule>()), Times.Never,
                "nothing to soft-delete");
        }

        [Fact]
        public async Task Handle_freeToPaid_withAllPaidModulesAlreadyActive_isNoOpOnModuleInserts()
        {
            var anchor = FixedToday.AddDays(-40);
            var store = CreateStore(paymentStartDate: anchor);
            store.StorePlanId = (int)StorePlanType.Gratis;
            store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));
            store.StoreModules.Add(CreatePaidModule(_storeId, moduleId: 2, price: 100f, _tenantId));

            ArrangeSuperAdmin();
            ArrangeStoreFetch(store);
            ArrangeEmptyFeatureBookkeeping();

            var catalog = new List<Module>
            {
                Module.Create(1, "Free", 0, priceIncluded: true, 0f, 0f, 0f, true, true),
                CreatePaidCatalogModule(2, 100f),
            };
            _mockModuleRepository.Setup(x => x.GetAvailableModulesToStore()).ReturnsAsync(catalog);
            _mockStoreModuleRepository
                .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
                .ReturnsAsync(store.StoreModules.ToList());

            var result = await CreateHandler().Handle(new ToggleStorePlanCommand(_storeId), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            store.StorePlanId.Should().Be((int)StorePlanType.Pago);
            // Anchor +40 days ago, trial 1 → due ~+70 days → future → no pin.
            store.NextDueDateOverride.Should().BeNull();
            _mockStoreModuleRepository.Verify(x => x.AddAsync(It.IsAny<StoreModule>()), Times.Never,
                "all paid modules already active");
        }
    }
}
