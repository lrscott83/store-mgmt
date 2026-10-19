using System.Linq.Expressions;
using Application.Abstractions.HttpContext;
using Application.Features.StoreManagement.Stores.Commands.UpdateStore;
using Application.Features.WebCatalog.Public;
using Application.UnitOfWorks;
using Domain.Common.Utils;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Domain.Interfaces.Services.Tenants;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.UpdateStore;

/// <summary>
/// public-catalog-static-pages (T9): la página estática inyecta el nombre y la descripción de la
/// tienda en el &lt;head&gt;. UpdateStore debe regenerarla cuando esos valores cambian de verdad —
/// después de persistir y sin poder tumbar el guardado (el regenerador es best-effort).
/// </summary>
public class UpdateStoreCommandHandlerRegenerationTests
{
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork = new();
    private readonly Mock<IStoreRepository> _mockStoreRepository = new();
    private readonly Mock<IModuleRepository> _mockModuleRepository = new();
    private readonly Mock<IStoreModuleRepository> _mockStoreModuleRepository = new();
    private readonly Mock<IHttpContextService> _mockHttpContextService = new();
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer = new();
    private readonly Mock<IGetStoreByIdService> _mockStoreByIdService = new();
    private readonly Mock<IFeatureRepository> _mockFeatureRepository = new();
    private readonly Mock<IStoreRoleFeatureGenerator> _mockStoreRoleFeaturesGenerator = new();
    private readonly Mock<IStoreRoleFeatureRepository> _mockStoreRoleFeatureRepository = new();
    private readonly Mock<IStoreSessionRevocationService> _mockSessionRevocationService = new();
    private readonly Mock<ICatalogStaticPageRegenerator> _mockCatalogPageRegenerator = new();
    private readonly UpdateStoreCommandHandler _handler;

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public UpdateStoreCommandHandlerRegenerationTests()
    {
        _handler = new UpdateStoreCommandHandler(
            _mockUnitOfWork.Object,
            _mockStoreRepository.Object,
            _mockModuleRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockHttpContextService.Object,
            _mockLocalizer.Object,
            _mockStoreByIdService.Object,
            _mockFeatureRepository.Object,
            _mockStoreRoleFeaturesGenerator.Object,
            _mockStoreRoleFeatureRepository.Object,
            _mockSessionRevocationService.Object,
            _mockCatalogPageRegenerator.Object);
    }

    private Store Arrange(bool superAdmin, string name = "Test Store", string? description = null)
    {
        var store = Store.Create(name, Guid.NewGuid(), true, _tenantId, paymentStartDate: null);
        typeof(Store).GetProperty("Id")!.SetValue(store, _storeId);
        store.Description = description;

        _mockHttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(superAdmin);
        _mockStoreByIdService.Setup(x => x.GetStoreByIdIncludingModulesAsync(_storeId)).ReturnsAsync(store);
        _mockStoreRepository
            .Setup(x => x.Where(It.IsAny<Expression<Func<Store, bool>>>()))
            .Returns(new List<Store>().AsQueryable());
        _mockStoreRepository.Setup(x => x.UpdateAsync(It.IsAny<Store>())).ReturnsAsync(true);
        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        return store;
    }

    private UpdateStoreCommand Command(string name, string? description) =>
        new(_storeId, name, Address: null, Description: description, Approved: false,
            ModuleIds: null, IsActive: true);

    [Fact]
    public async Task Handle_NameChanged_RegeneratesTheCatalogPage()
    {
        Arrange(superAdmin: false);

        await _handler.Handle(Command("Renamed", description: null), CancellationToken.None);

        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(_storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_DescriptionChangedBySuperAdmin_RegeneratesTheCatalogPage()
    {
        Arrange(superAdmin: true, description: "Old description");

        await _handler.Handle(Command("Test Store", description: "New description"), CancellationToken.None);

        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(_storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_NameAndDescriptionUnchanged_DoesNotRegenerate()
    {
        Arrange(superAdmin: true, description: "Same description");

        await _handler.Handle(Command("Test Store", description: "Same description"), CancellationToken.None);

        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_OwnerAdminSendsDescriptionChange_IgnoredAndDoesNotRegenerate()
    {
        // OwnerAdmin cannot write Description through this command: if the ignored value triggered
        // a regeneration, every owner save would rewrite the page for nothing.
        Arrange(superAdmin: false, description: "Stored description");

        await _handler.Handle(Command("Test Store", description: "Ignored description"), CancellationToken.None);

        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_RegeneratesAfterPersisting()
    {
        Arrange(superAdmin: false);

        var saveCompleted = false;
        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Callback(() => saveCompleted = true)
            .ReturnsAsync(1);
        _mockCatalogPageRegenerator
            .Setup(x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback(() => saveCompleted.Should()
                .BeTrue("the page must be generated from the already-persisted store data"))
            .Returns(Task.CompletedTask);

        await _handler.Handle(Command("Renamed", description: null), CancellationToken.None);

        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(_storeId, It.IsAny<CancellationToken>()), Times.Once);
    }
}
