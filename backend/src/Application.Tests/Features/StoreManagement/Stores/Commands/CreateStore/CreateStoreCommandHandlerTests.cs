using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.CreateStore;
using Application.Services.Notifications;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using Domain.Entities.Notifications;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.CreateStore;

/// <summary>
/// Unit tests for CreateStoreCommandHandler covering Gate 2 (role re-verification), the
/// OwnerAdmin branch (own-owner derivation, selected-store MultiStores gate, forced approval) and
/// the SuperAdmin branch (approved forced true, 2026-09-10 — the body's Approved value is ignored).
/// <para>
/// store-birth-superior (2026-10-11, replaces store-birth-pago-only): the handler neither receives
/// nor derives a module set. <c>ICreateStoreService.CreateStoreAsync</c> has no module parameter,
/// so what this handler decides is the owner identity, the gates, and the save — nothing about
/// which modules the child gets.
/// </para>
/// </summary>
public class CreateStoreCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IOwnerRepository> _mockOwnerRepository;
    private readonly Mock<IStoreModuleRepository> _mockStoreModuleRepository;
    private readonly Mock<IBillingService> _mockBillingService;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IMapper> _mockMapper;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly Mock<ICreateStoreService> _mockCreateStoreService;
    private readonly Mock<IOwnerRegistrationNotificationService> _mockOwnerRegistrationNotificationService;
    private readonly CreateStoreCommandHandler _handler;

    private readonly Guid _callerUserId = Guid.NewGuid();
    private readonly Guid _callerStoreId = Guid.NewGuid();

    public CreateStoreCommandHandlerTests()
    {
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockOwnerRepository = new Mock<IOwnerRepository>();
        _mockStoreModuleRepository = new Mock<IStoreModuleRepository>();
        _mockBillingService = new Mock<IBillingService>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockMapper = new Mock<IMapper>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        _mockCreateStoreService = new Mock<ICreateStoreService>();
        _mockOwnerRegistrationNotificationService = new Mock<IOwnerRegistrationNotificationService>();

        _mockUnitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_callerUserId.ToString());
        _mockHttpContextService.Setup(x => x.StoreId).Returns(_callerStoreId.ToString());

        _handler = CreateHandler(_mockOwnerRegistrationNotificationService.Object);
    }

    /// <summary>
    /// Factory, not a second inline construction: one test needs the REAL notification service over
    /// a throwing repository, and duplicating a 10-argument call to allow that would let the two
    /// constructions drift apart.
    /// </summary>
    private CreateStoreCommandHandler CreateHandler(IOwnerRegistrationNotificationService notificationService)
        => new(
            _mockUnitOfWork.Object,
            _mockOwnerRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockBillingService.Object,
            _mockHttpContextService.Object,
            _mockMapper.Object,
            _mockLocalizer.Object,
            _mockCreateStoreService.Object,
            notificationService);

    private CreateStoreCommand CreateOwnerCommand(Guid ownerId = default)
        => new(ownerId, "New Store", "Address 1", null, false);

    private Owner ArrangeCallerOwner()
    {
        var owner = Owner.Create(_callerUserId, false, Guid.NewGuid(), "Owner");
        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_callerUserId))
            .ReturnsAsync(owner);
        _mockOwnerRepository
            .Setup(x => x.GetOwnerIncludingUserByIdAsync(owner.Id, CancellationToken.None))
            .ReturnsAsync(owner);
        return owner;
    }

    private void ArrangeSelectedStoreModules(params int[] moduleIds)
    {
        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_callerStoreId))
            .ReturnsAsync(moduleIds.Select(id => StoreModule.Create(
                _callerStoreId, id, 0, true, 0, 0, 0, Guid.NewGuid())).ToList());
    }

    private void ArrangeAvailableModulesAlDia()
    {
        _mockStoreModuleRepository
            .Setup(x => x.GetAvailableModulesByStoreIdAsync(_callerStoreId))
            .ReturnsAsync(new List<Module>
            {
                Module.Create(7, "Management", 1, true, 0, true, true),
                Module.Create((int)ModuleType.MultiStores, "MultiStores", 2, false, 5, true, true),
            });
        _mockBillingService
            .Setup(x => x.GetStoreBillingSummaryAsync(_callerStoreId))
            .ReturnsAsync(new StoreBillingSummary { Status = StoreBillingStatusType.AlDia });
    }

    private void ArrangeAvailableModulesVencido()
    {
        _mockStoreModuleRepository
            .Setup(x => x.GetAvailableModulesByStoreIdAsync(_callerStoreId))
            .ReturnsAsync(new List<Module>
            {
                Module.Create(7, "Management", 1, true, 0, true, true),
                Module.Create((int)ModuleType.MultiStores, "MultiStores", 2, false, 5, true, true),
            });
        _mockBillingService
            .Setup(x => x.GetStoreBillingSummaryAsync(_callerStoreId))
            .ReturnsAsync(new StoreBillingSummary { Status = StoreBillingStatusType.Vencido });
    }

    private void ArrangeStoreCreation(Owner owner, out Store created)
    {
        created = Store.Create("New Store", owner.Id, true, owner.TenantId);
        _mockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<bool>()))
            .ReturnsAsync(created);
        _mockMapper
            .Setup(x => x.Map<StoreDto>(It.IsAny<Store>()))
            .Returns(new StoreDto { Id = created.Id, Name = created.Name, OwnerId = created.OwnerId, Approved = created.Approved });
    }

    /// <summary>
    /// SuperAdmin-branch owner WITH its <c>User</c> loaded, mirroring what
    /// <c>GetOwnerIncludingUserByIdAsync</c> really returns (it <c>Include</c>s <c>o.User</c>). The
    /// owner's full name and cell phone both live on that navigation — never on <c>Owner</c> — so a
    /// fixture without it would exercise the "nothing to report" branch instead of the notice.
    /// </summary>
    private Owner ArrangeSuperAdminOwner(string fullName, string? cellPhone)
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var owner = Owner.Create(userId, false, tenantId, "Owner");
        owner.User = User.Create(userId, "ana", "pwd", fullName, cellPhone, "ana@example.com", tenantId);
        _mockOwnerRepository
            .Setup(x => x.GetOwnerIncludingUserByIdAsync(owner.Id, CancellationToken.None))
            .ReturnsAsync(owner);
        return owner;
    }

    #region Gate 2

    [Fact]
    public async Task Handle_store_user_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: false);

        var act = () => _handler.Handle(CreateOwnerCommand(Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _mockCreateStoreService.Verify(
            x => x.CreateStoreAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<bool>()), Times.Never);
    }

    #endregion

    #region OwnerAdmin branch

    [Fact]
    public async Task Handle_owner_admin_without_owner_record_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        _mockOwnerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_callerUserId))
            .ReturnsAsync((Owner)null!);

        var act = () => _handler.Handle(CreateOwnerCommand(), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _mockOwnerRepository.Verify(x => x.GetOwnerIncludingUserByIdAsync(It.IsAny<Guid>(), CancellationToken.None), Times.Never);
    }

    [Fact]
    public async Task Handle_owner_admin_with_foreign_owner_id_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        ArrangeCallerOwner();

        var act = () => _handler.Handle(CreateOwnerCommand(Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _mockOwnerRepository.Verify(x => x.GetOwnerIncludingUserByIdAsync(It.IsAny<Guid>(), CancellationToken.None), Times.Never);
    }

    [Fact]
    public async Task Handle_owner_admin_without_selected_store_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        ArrangeCallerOwner();
        _mockHttpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        var act = () => _handler.Handle(CreateOwnerCommand(), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _mockOwnerRepository.Verify(x => x.GetOwnerIncludingUserByIdAsync(It.IsAny<Guid>(), CancellationToken.None), Times.Never);
    }

    [Fact]
    public async Task Handle_owner_admin_without_multistores_after_billing_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        ArrangeCallerOwner();
        ArrangeAvailableModulesVencido();

        var act = () => _handler.Handle(CreateOwnerCommand(), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _mockOwnerRepository.Verify(x => x.GetOwnerIncludingUserByIdAsync(It.IsAny<Guid>(), CancellationToken.None), Times.Never);
    }

    [Fact]
    public async Task Handle_owner_admin_creates_using_own_owner_regardless_of_the_selected_store_modules()
    {
        // store-birth-superior (2026-10-11): the handler reads NOTHING about the selected store's
        // module set — not even to inherit it. Only the MultiStores gate above decides. This is the
        // structural counterpart of removing ModuleIds from the command: the call the service
        // receives has no module argument to assert on.
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        var owner = ArrangeCallerOwner();
        ArrangeAvailableModulesAlDia();
        ArrangeSelectedStoreModules(7, (int)ModuleType.MultiStores);
        ArrangeStoreCreation(owner, out _);

        var result = await _handler.Handle(CreateOwnerCommand(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockOwnerRepository.Verify(x => x.GetOwnerIncludingUserByIdAsync(owner.Id, CancellationToken.None), Times.Once);
        _mockCreateStoreService.Verify(x => x.CreateStoreAsync(
            owner.Id,
            owner.TenantId,
            "New Store",
            "Address 1",
            null,
            true), // Owner decision 6: owner-created stores are approved immediately.
            Times.Once);
        // The whole point: the selected store's rows are never read to build the child.
        _mockStoreModuleRepository.Verify(x => x.GetStoreModulesByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task Handle_owner_admin_does_not_filter_the_selected_store_module_set()
    {
        // store-birth-superior (2026-10-11): the old clamp-to-Pago filter is gone. A Superior/VIP
        // selected store carrying every Superior/VIP-only member produces the SAME call as one
        // carrying only Management — there is nothing left to filter.
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        var owner = ArrangeCallerOwner();
        ArrangeAvailableModulesAlDia();
        ArrangeSelectedStoreModules(7, (int)ModuleType.WholesaleSales, (int)ModuleType.Warehouses,
            (int)ModuleType.MultiStores, (int)ModuleType.MultiMonedas, (int)ModuleType.MultiPayments,
            (int)ModuleType.Elaboration);
        ArrangeStoreCreation(owner, out _);

        var result = await _handler.Handle(CreateOwnerCommand(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockCreateStoreService.Verify(x => x.CreateStoreAsync(
            owner.Id, owner.TenantId, "New Store", "Address 1", null, true),
            Times.Once);
        _mockStoreModuleRepository.Verify(x => x.GetStoreModulesByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task Handle_owner_admin_ignores_body_owner_id_deriving_own_owner()
    {
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        var owner = ArrangeCallerOwner();
        ArrangeAvailableModulesAlDia();
        ArrangeSelectedStoreModules(7);
        ArrangeStoreCreation(owner, out _);

        // Body OwnerId is zero-Guid (owner-branch contract) -> derive the caller's own owner.
        var result = await _handler.Handle(CreateOwnerCommand(Guid.Empty), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockCreateStoreService.Verify(x => x.CreateStoreAsync(
            owner.Id, owner.TenantId, "New Store", "Address 1", null, true), Times.Once);
    }

    #endregion

    #region SuperAdmin branch

    [Fact]
    public async Task Handle_super_admin_creates_and_request_approved_ignored()
    {
        ArrangeRoles(isSuperAdmin: true, isOwnerAdmin: false);
        var owner = Owner.Create(Guid.NewGuid(), false, Guid.NewGuid(), "Owner");
        _mockOwnerRepository
            .Setup(x => x.GetOwnerIncludingUserByIdAsync(owner.Id, CancellationToken.None))
            .ReturnsAsync(owner);
        ArrangeStoreCreation(owner, out _);
        // Body says Approved=false — it is ignored: every creation path forces approved=true (2026-09-10).
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false);

        var result = await _handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockCreateStoreService.Verify(x => x.CreateStoreAsync(
            owner.Id, owner.TenantId, "Admin Store", null, null, true), Times.Once);
    }

    [Fact]
    public async Task Handle_save_changes_zero_returns_failure()
    {
        ArrangeRoles(isSuperAdmin: true, isOwnerAdmin: false);
        var owner = Owner.Create(Guid.NewGuid(), false, Guid.NewGuid(), "Owner");
        _mockOwnerRepository
            .Setup(x => x.GetOwnerIncludingUserByIdAsync(owner.Id, CancellationToken.None))
            .ReturnsAsync(owner);
        ArrangeStoreCreation(owner, out _);
        _mockUnitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false);

        var result = await _handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
    }

    #endregion

    #region SuperAdmin notice on store creation

    [Fact]
    public async Task Handle_notifies_super_admin_with_owner_name_cellphone_and_store()
    {
        ArrangeRoles(isSuperAdmin: true, isOwnerAdmin: false);
        var owner = ArrangeSuperAdminOwner("Ana Gómez", "+5491122334455");
        ArrangeStoreCreation(owner, out _);
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false);

        var result = await _handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        // "New Store" is the name the CREATED store carries (what CreateStoreAsync returned), not
        // the command's name: the notice reports the store that actually landed.
        _mockOwnerRegistrationNotificationService.Verify(
            x => x.NotifyAsync(
                It.Is<OwnerRegistrationNotification.OwnerRegistrationTarget>(t =>
                    t.OwnerName == "Ana Gómez" &&
                    t.OwnerCellPhone == "+5491122334455" &&
                    t.StoreName == "New Store"),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_emits_no_notification_when_the_save_fails()
    {
        ArrangeRoles(isSuperAdmin: true, isOwnerAdmin: false);
        var owner = ArrangeSuperAdminOwner("Ana Gómez", "+5491122334455");
        ArrangeStoreCreation(owner, out _);
        _mockUnitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false);

        var result = await _handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        // Nothing was committed, so there is nothing to report.
        _mockOwnerRegistrationNotificationService.Verify(
            x => x.NotifyAsync(
                It.IsAny<OwnerRegistrationNotification.OwnerRegistrationTarget>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_emits_no_notification_when_the_owner_has_no_cell_phone()
    {
        ArrangeRoles(isSuperAdmin: true, isOwnerAdmin: false);
        var owner = ArrangeSuperAdminOwner("Ana Gómez", cellPhone: null);
        ArrangeStoreCreation(owner, out _);
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false);

        var result = await _handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        // The shared policy drops a notice with an empty phone — reused as-is, not re-decided here.
        _mockOwnerRegistrationNotificationService.Verify(
            x => x.NotifyAsync(
                It.IsAny<OwnerRegistrationNotification.OwnerRegistrationTarget>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_notification_write_failure_still_returns_success_and_never_throws()
    {
        ArrangeRoles(isSuperAdmin: true, isOwnerAdmin: false);
        var owner = ArrangeSuperAdminOwner("Ana Gómez", "+5491122334455");
        ArrangeStoreCreation(owner, out _);

        // The REAL service, over a repository that throws. That is deliberate: "a notice can never
        // turn a committed store into a 500" is guaranteed by the service's own try/catch
        // (OwnerRegistrationNotificationService.NotifyAsync), NOT by the handler — a throwing MOCK of
        // the interface would just propagate and prove nothing about production behaviour.
        var throwingRepository = new Mock<INotificationRepository>();
        throwingRepository
            .Setup(x => x.AddAsync(It.IsAny<Notification>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Notification table unavailable."));
        var handler = CreateHandler(new OwnerRegistrationNotificationService(
            throwingRepository.Object,
            Mock.Of<ILogger<OwnerRegistrationNotificationService>>()));
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false);

        var result = await handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
    }

    #endregion

    private void ArrangeRoles(bool isSuperAdmin, bool isOwnerAdmin)
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(isSuperAdmin);
        _mockHttpContextService.Setup(x => x.IsOwnerAdmin).Returns(isOwnerAdmin);
    }
}