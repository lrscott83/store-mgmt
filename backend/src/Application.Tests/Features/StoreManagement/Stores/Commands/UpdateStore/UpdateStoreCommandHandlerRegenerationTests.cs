using System.Linq.Expressions;
using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.UpdateStore;
using Application.Features.WebCatalog.Public;
using Application.Services.Stores;
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

    [Fact]
    public async Task Handle_LocationFields_ArePersistedTrimmedAndRegenerate()
    {
        var store = Arrange(superAdmin: false);

        var command = Command("Test Store", description: null) with
        {
            Address = "Calle 23 #45, entre 10 y 12",
            PublicPhone = "  +53 5555 1234 ",
            AddressCity = " La Habana ",
            AddressProvince = " Plaza ",
            Latitude = 23.13,
            Longitude = -82.38,
            OpeningHours = new[] { new OpeningHoursEntry("Monday", "09:00", "17:00") },
            UpdateLocation = true,
        };

        await _handler.Handle(command, CancellationToken.None);

        store.Address.Should().Be("Calle 23 #45, entre 10 y 12");
        store.PublicPhone.Should().Be("+53 5555 1234");
        store.AddressCity.Should().Be("La Habana");
        store.AddressProvince.Should().Be("Plaza");
        store.Latitude.Should().Be(23.13);
        store.Longitude.Should().Be(-82.38);
        store.OpeningHoursJson.Should()
            .Be("[{\"day\":\"Monday\",\"opens\":\"09:00\",\"closes\":\"17:00\"}]");
        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(_storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_AddressChanged_RegeneratesBecauseAddressFeedsTheJsonLd()
    {
        var store = Arrange(superAdmin: false);

        await _handler.Handle(
            Command("Test Store", description: null) with
            {
                Address = "Calle 23 #45",
                UpdateLocation = true,
            },
            CancellationToken.None);

        store.Address.Should().Be("Calle 23 #45");
        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(_storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_LocationFieldsUnchanged_DoesNotRegenerate()
    {
        var store = Arrange(superAdmin: false);
        store.Address = "Calle 23 #45";
        store.PublicPhone = "+53 5555 1234";
        store.AddressCity = "La Habana";
        store.AddressProvince = "Plaza";
        store.Latitude = 23.13;
        store.Longitude = -82.38;
        store.OpeningHoursJson = "[{\"day\":\"Monday\",\"opens\":\"09:00\",\"closes\":\"17:00\"}]";

        var command = Command("Test Store", description: null) with
        {
            Address = "Calle 23 #45",
            PublicPhone = "+53 5555 1234",
            AddressCity = "La Habana",
            AddressProvince = "Plaza",
            Latitude = 23.13,
            Longitude = -82.38,
            // Mismo horario, escrito en otro orden: la canonicalización lo deja idéntico.
            OpeningHours = new[] { new OpeningHoursEntry("Monday", "09:00", "17:00") },
            UpdateLocation = true,
        };

        await _handler.Handle(command, CancellationToken.None);

        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_InvalidOpeningHours_ThrowsValidationAndDoesNotPersist()
    {
        Arrange(superAdmin: false);

        Func<Task> act = () => _handler.Handle(
            Command("Test Store", description: null) with
            {
                OpeningHours = new[] { new OpeningHoursEntry("Lunes", "09:00", "17:00") },
                UpdateLocation = true,
            },
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_LatitudeWithoutLongitude_ThrowsValidationAndDoesNotPersist()
    {
        Arrange(superAdmin: false);

        Func<Task> act = () => _handler.Handle(
            Command("Test Store", description: null) with { Latitude = 23.13, UpdateLocation = true },
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_CoordinatesOutOfRange_ThrowsValidationAndDoesNotPersist()
    {
        Arrange(superAdmin: false);

        Func<Task> act = () => _handler.Handle(
            Command("Test Store", description: null) with
            {
                Latitude = 123.13,
                Longitude = -82.38,
                UpdateLocation = true,
            },
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutUpdateLocation_LeavesTheStoredLocationUntouched()
    {
        // El modal de "mis tiendas" renombra con un payload parcial (address: '', sin teléfono ni
        // coordenadas). Sin el flag, ese payload no puede borrar la ubicación pública — si la
        // borrara, la próxima regeneración dejaría la página sin JSON-LD de ubicación.
        var store = Arrange(superAdmin: false);
        store.Address = "Calle 23 #45";
        store.PublicPhone = "+53 5555 1234";
        store.AddressCity = "La Habana";
        store.AddressProvince = "Plaza";
        store.Latitude = 23.13;
        store.Longitude = -82.38;
        store.OpeningHoursJson =
            "[{\"day\":\"Monday\",\"opens\":\"09:00\",\"closes\":\"17:00\"}]";

        await _handler.Handle(
            Command("Test Store", description: null) with { Address = string.Empty },
            CancellationToken.None);

        store.Address.Should().Be("Calle 23 #45");
        store.PublicPhone.Should().Be("+53 5555 1234");
        store.AddressCity.Should().Be("La Habana");
        store.AddressProvince.Should().Be("Plaza");
        store.Latitude.Should().Be(23.13);
        store.Longitude.Should().Be(-82.38);
        store.OpeningHoursJson.Should()
            .Be("[{\"day\":\"Monday\",\"opens\":\"09:00\",\"closes\":\"17:00\"}]");
        _mockCatalogPageRegenerator.Verify(
            x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
