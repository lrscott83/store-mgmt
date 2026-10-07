using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver;
using Application.UnitOfWorks;
using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Editar y activar/desactivar un repartidor (F7) fija el aislamiento por tienda, que es el
/// criterio de aceptación 2 del documento y el riesgo real de esta feature:
///
///   1. Un repartidor de OTRA tienda no se puede modificar. La comprobación es
///      `driver.StoreId == storeId` sobre la fila CARGADA: un `GetByIdAsync` sin filtro dejaría
///      que un dueño escribiera el nombre de un repartidor de la tienda de otro.
///   2. Desactivar NO borra: solo baja `IsActive`. Los pedidos que ya llevó conservan su
///      `DriverId` (criterio 3) — por eso la baja es lógica y no un DELETE.
///   3. La fila cargada conserva SU `Id`: cambiarla convertiría el UPDATE en un INSERT.
///
/// Y lo que NO hace: asignar ni reasignar pedidos. Los pedidos de un repartidor inactivo se
/// reasignan a mano, y esa acción es de F5.
/// </summary>
public class UpdateDeliveryDriverCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IDeliveryDriverRepository> _driverRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public UpdateDeliveryDriverCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _driverRepository
            .Setup(x => x.UpdateAsync(It.IsAny<DeliveryDriver>()))
            .ReturnsAsync(true);
    }

    private UpdateDeliveryDriverCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _driverRepository.Object,
        _localizer.Object);

    /// <summary>Repartidor ya existente de la tienda en contexto.</summary>
    private DeliveryDriver Existing(bool active = true)
    {
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, "Ana", "+5351111111", _tenantId);
        driver.IsActive = active;
        _driverRepository.Setup(x => x.GetByIdAsync(driver.Id)).ReturnsAsync(driver);
        return driver;
    }

    private static UpdateDeliveryDriverCommand Command(Guid id, bool isActive = true)
        => new() { Id = id, Name = "Ana María", Phone = "+5352222222", IsActive = isActive };

    #region Happy Path

    [Fact]
    public async Task Handle_ShouldWriteTheNamePhoneAndActiveFlag()
    {
        DeliveryDriver driver = Existing();

        var result = await Handler().Handle(Command(driver.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Name.Should().Be("Ana María");
        result.Data.Phone.Should().Be("+5352222222");
        result.Data.IsActive.Should().BeTrue();

        _driverRepository.Verify(x => x.UpdateAsync(It.Is<DeliveryDriver>(d =>
            d.Id == driver.Id
            && d.Name == "Ana María"
            && d.Phone == "+5352222222")), Times.Once);
    }

    /// <summary>
    /// Desactivar es una BAJA LÓGICA: la fila se sigue escribiendo con `IsActive = false` y su id
    /// intacto, así que los pedidos que ya llevó conservan la referencia (criterio 3).
    /// </summary>
    [Fact]
    public async Task Handle_WhenDeactivating_ShouldOnlyFlipTheFlagAndKeepTheRow()
    {
        DeliveryDriver driver = Existing();

        var result = await Handler().Handle(Command(driver.Id, isActive: false), CancellationToken.None);

        result.Data!.Id.Should().Be(driver.Id);
        result.Data.IsActive.Should().BeFalse();

        _driverRepository.Verify(x => x.UpdateAsync(It.Is<DeliveryDriver>(d => d.Id == driver.Id)), Times.Once);
        _driverRepository.Verify(x => x.SoftDeleteAsync(It.IsAny<DeliveryDriver>()), Times.Never);
        _driverRepository.Verify(x => x.DeleteAsync(It.IsAny<DeliveryDriver>()), Times.Never);
        _driverRepository.Verify(x => x.HardDeleteAsync(It.IsAny<DeliveryDriver>()), Times.Never);
    }

    /// <summary>Volver a activar un repartidor dado de baja es la otra mitad del interruptor.</summary>
    [Fact]
    public async Task Handle_WhenReactivatingAnInactiveDriver_ShouldBringItBack()
    {
        DeliveryDriver driver = Existing(active: false);

        var result = await Handler().Handle(Command(driver.Id, isActive: true), CancellationToken.None);

        result.Data!.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_ShouldTrimTheNameAndThePhone()
    {
        DeliveryDriver driver = Existing();

        UpdateDeliveryDriverCommand command = Command(driver.Id);
        command.Name = "  Ana María  ";
        command.Phone = "  +5352222222  ";

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Data!.Name.Should().Be("Ana María");
        result.Data.Phone.Should().Be("+5352222222");
    }

    /// <summary>La tienda y el tenant NO se reescriben: son de la fila, no del cuerpo.</summary>
    [Fact]
    public async Task Handle_ShouldNotMoveTheDriverToAnotherStore()
    {
        DeliveryDriver driver = Existing();

        var result = await Handler().Handle(Command(driver.Id), CancellationToken.None);

        result.Data!.StoreId.Should().Be(_storeId);
    }

    [Fact]
    public async Task Handle_ShouldSaveTheChangesOnce()
    {
        DeliveryDriver driver = Existing();

        await Handler().Handle(Command(driver.Id), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>Editar NO da de alta repartidores ni toca el resto del catálogo.</summary>
    [Fact]
    public async Task Handle_ShouldNotAddAnyDriver()
    {
        DeliveryDriver driver = Existing();

        await Handler().Handle(Command(driver.Id), CancellationToken.None);

        _driverRepository.Verify(x => x.AddAsync(It.IsAny<DeliveryDriver>()), Times.Never);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Repartidor de OTRA tienda: mismo 404 que si no existiera. Distinguir los dos casos en el
    /// mensaje confirmaría la existencia de un repartidor ajeno.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheDriverBelongsToAnotherStore_ShouldReject()
    {
        DeliveryDriver foreign = DeliveryDriver.Create(Guid.NewGuid(), "Ajeno", "+5359999999", _tenantId);
        _driverRepository.Setup(x => x.GetByIdAsync(foreign.Id)).ReturnsAsync(foreign);

        Func<Task> act = () => Handler().Handle(Command(foreign.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _driverRepository.Verify(x => x.UpdateAsync(It.IsAny<DeliveryDriver>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenTheDriverBelongsToAnotherStore_ShouldReportNotFound()
    {
        DeliveryDriver foreign = DeliveryDriver.Create(Guid.NewGuid(), "Ajeno", "+5359999999", _tenantId);
        _driverRepository.Setup(x => x.GetByIdAsync(foreign.Id)).ReturnsAsync(foreign);

        Func<Task> act = () => Handler().Handle(Command(foreign.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_WhenTheDriverDoesNotExist_ShouldReject()
    {
        Guid id = Guid.NewGuid();
        _driverRepository.Setup(x => x.GetByIdAsync(id)).ReturnsAsync((DeliveryDriver?)null);

        Func<Task> act = () => Handler().Handle(Command(id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _driverRepository.Verify(x => x.UpdateAsync(It.IsAny<DeliveryDriver>()), Times.Never);
    }

    /// <summary>
    /// Sin tienda en el contexto no hay nada que verificar contra la fila, así que se rechaza
    /// ANTES de leer: cargar el repartidor primero filtraría por otra vía.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldRejectBeforeReading()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(Command(Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _driverRepository.Verify(x => x.GetByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    #endregion
}
