using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.CreateStore;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.CreateStore;

/// <summary>
/// Unit tests for CreateStoreCommandHandler covering Gate 2 (role re-verification), the
/// OwnerAdmin branch (own-owner derivation, selected-store MultiStores gate, module
/// inheritance, forced approval) and the unchanged SuperAdmin branch.
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

        _mockUnitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_callerUserId.ToString());
        _mockHttpContextService.Setup(x => x.StoreId).Returns(_callerStoreId.ToString());

        _handler = new CreateStoreCommandHandler(
            _mockUnitOfWork.Object,
            _mockOwnerRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockBillingService.Object,
            _mockHttpContextService.Object,
            _mockMapper.Object,
            _mockLocalizer.Object,
            _mockCreateStoreService.Object);
    }

    private CreateStoreCommand CreateOwnerCommand(Guid ownerId = default)
        => new(ownerId, "New Store", "Address 1", null, false, new List<int>());

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
                It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<List<int>>()))
            .ReturnsAsync(created);
        _mockMapper
            .Setup(x => x.Map<StoreDto>(It.IsAny<Store>()))
            .Returns(new StoreDto { Id = created.Id, Name = created.Name, OwnerId = created.OwnerId, Approved = created.Approved });
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
                It.IsAny<string?>(), It.IsAny<bool>(), It.IsAny<List<int>>()), Times.Never);
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
    public async Task Handle_owner_admin_without_inherited_modules_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdmin: false, isOwnerAdmin: true);
        ArrangeCallerOwner();
        ArrangeAvailableModulesAlDia();
        // Selected store has no modules -> nothing to inherit.
        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_callerStoreId))
            .ReturnsAsync(new List<StoreModule>());

        var act = () => _handler.Handle(CreateOwnerCommand(), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _mockOwnerRepository.Verify(x => x.GetOwnerIncludingUserByIdAsync(It.IsAny<Guid>(), CancellationToken.None), Times.Never);
    }

    [Fact]
    public async Task Handle_owner_admin_creates_using_own_owner_and_inherited_modules()
    {
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
            true, // Owner decision 6: owner-created stores are approved immediately.
            It.Is<List<int>>(m => m.SequenceEqual(new List<int> { 7, (int)ModuleType.MultiStores }))),
            Times.Once);
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
            owner.Id, owner.TenantId, "New Store", "Address 1", null, true,
            It.IsAny<List<int>>()), Times.Once);
    }

    #endregion

    #region SuperAdmin branch (unchanged regression)

    [Fact]
    public async Task Handle_super_admin_creates_with_body_values()
    {
        ArrangeRoles(isSuperAdmin: true, isOwnerAdmin: false);
        var owner = Owner.Create(Guid.NewGuid(), false, Guid.NewGuid(), "Owner");
        _mockOwnerRepository
            .Setup(x => x.GetOwnerIncludingUserByIdAsync(owner.Id, CancellationToken.None))
            .ReturnsAsync(owner);
        ArrangeStoreCreation(owner, out _);
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false, new List<int> { 1, 2 });

        var result = await _handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockCreateStoreService.Verify(x => x.CreateStoreAsync(
            owner.Id, owner.TenantId, "Admin Store", null, null, false, It.Is<List<int>>(m => m.SequenceEqual(new List<int> { 1, 2 }))),
            Times.Once);
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
        var request = new CreateStoreCommand(owner.Id, "Admin Store", null, null, false, new List<int> { 1 });

        var result = await _handler.Handle(request, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
    }

    #endregion

    private void ArrangeRoles(bool isSuperAdmin, bool isOwnerAdmin)
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(isSuperAdmin);
        _mockHttpContextService.Setup(x => x.IsOwnerAdmin).Returns(isOwnerAdmin);
    }
}