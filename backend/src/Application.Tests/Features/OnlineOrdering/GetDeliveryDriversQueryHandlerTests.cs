using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Queries.GetDeliveryDrivers;
using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Leer el CATÁLOGO de repartidores de la tienda (F7) tiene tres responsabilidades que este suite
/// fija:
///
///   1. La lista es SIEMPRE de la tienda del contexto — el filtro va en la llamada al
///      repositorio, no en un `Where` posterior: un repartidor ajeno no puede salir en la lista
///      ni aunque el handler receive todos.
///   2. `activeOnly` decide si los dados de baja se incluyen. El valor por defecto es `false`
///      (solo activos), que es lo que necesita el selector de reparto; la vista de gestión pide
///      `true` para poder volver a activarlos.
///   3. Una tienda sin repartidores es una lista VACÍA, no un 404 ni un error: es el estado
///      normal de una tienda que aún no ha dado de alta a nadie.
///
/// Y lo que NO hace: contar pedidos ni asignar repartidores a pedidos. Eso es F5.
/// </summary>
public class GetDeliveryDriversQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IDeliveryDriverRepository> _driverRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public GetDeliveryDriversQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
    }

    private GetDeliveryDriversQueryHandler Handler() => new(
        _httpContextService.Object,
        _driverRepository.Object,
        _localizer.Object);

    /// <summary>
    /// Repartidor de una tienda cualquiera. El `StoreId` se fija aparte porque los tests que
    /// importan el aislamiento necesitan el de la tienda en contexto, no uno aleatorio.
    /// </summary>
    private static DeliveryDriver Driver(
        string name, string phone = "+5350000000", bool active = true, Guid? storeId = null)
    {
        DeliveryDriver driver = DeliveryDriver.Create(storeId ?? Guid.NewGuid(), name, phone, Guid.NewGuid());
        if (!active)
            driver.IsActive = false;
        return driver;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_ShouldMapEveryDriverOfTheStore()
    {
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(_storeId, true))
            .ReturnsAsync([Driver("Ana", storeId: _storeId), Driver("Beto", storeId: _storeId)]);

        var result = await Handler().Handle(new GetDeliveryDriversQuery(ActiveOnly: true), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(2);
        result.Data!.Select(d => d.Name).Should().BeEquivalentTo(["Ana", "Beto"]);
        result.Data.Should().OnlyContain(d => d.StoreId == _storeId);
    }

    [Fact]
    public async Task Handle_ShouldCarryThePhoneAndTheActiveFlag()
    {
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(_storeId, true))
            .ReturnsAsync([Driver("Ana", "+5351111111", active: false, storeId: _storeId)]);

        var result = await Handler().Handle(new GetDeliveryDriversQuery(ActiveOnly: true), CancellationToken.None);

        var driver = result.Data!.Single();
        driver.Phone.Should().Be("+5351111111");
        driver.IsActive.Should().BeFalse();
    }

    /// <summary>
    /// El DTO SÍ lleva `StoreId` (a diferencia del de configuración de F1): la vista de gestión
    /// lista repartidores de una sola tienda, pero el dato hace explícito de qué tienda es cada
    /// fila en la respuesta en vez de dejarlo implícito.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldExposeTheStoreOfEachDriver()
    {
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, "Ana", "+5351111111", Guid.NewGuid());
        _driverRepository.Setup(x => x.GetByStoreIdAsync(_storeId, true)).ReturnsAsync([driver]);

        var result = await Handler().Handle(new GetDeliveryDriversQuery(ActiveOnly: true), CancellationToken.None);

        result.Data!.Single().StoreId.Should().Be(_storeId);
    }

    /// <summary>
    /// Tienda sin repartidores: lista vacía y éxito. Un 404 obligaría al frontend a modelar
    /// "todavía no hay nadie" como un error.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoDrivers_ShouldReturnAnEmptyList()
    {
        _driverRepository.Setup(x => x.GetByStoreIdAsync(_storeId, It.IsAny<bool>())).ReturnsAsync([]);

        var result = await Handler().Handle(new GetDeliveryDriversQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeEmpty();
    }

    #endregion

    #region Integration / Dependencies

    /// <summary>
    /// El filtro por tienda viaja al REPOSITORIO. Es la única forma de garantizar el aislamiento:
    /// filtrar en memoria significaría haber leído ya las filas de otras tiendas.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldAskTheRepositoryOnlyForTheStoreInContext()
    {
        _driverRepository.Setup(x => x.GetByStoreIdAsync(_storeId, It.IsAny<bool>())).ReturnsAsync([]);

        await Handler().Handle(new GetDeliveryDriversQuery(), CancellationToken.None);

        _driverRepository.Verify(x => x.GetByStoreIdAsync(_storeId, It.IsAny<bool>()), Times.Once);
        _driverRepository.Verify(
            x => x.GetByStoreIdAsync(It.Is<Guid>(id => id != _storeId), It.IsAny<bool>()), Times.Never);
        _driverRepository.Verify(x => x.GetAllAsync(), Times.Never);
    }

    /// <summary>
    /// `activeOnly` es el interruptor de la vista: apagado (el valor por defecto) solo activos,
    /// que es lo que necesita el selector de reparto de F5; encendido, también los dados de baja
    /// para poder reactivarlos.
    /// </summary>
    [Fact]
    public async Task Handle_WhenActiveOnlyIsFalse_ShouldNotIncludeTheInactiveOnes()
    {
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(_storeId, false))
            .ReturnsAsync([Driver("Ana")]);
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(_storeId, true))
            .ReturnsAsync([Driver("Ana"), Driver("Beto", active: false)]);

        var result = await Handler().Handle(new GetDeliveryDriversQuery(), CancellationToken.None);

        result.Data.Should().ContainSingle();
        _driverRepository.Verify(x => x.GetByStoreIdAsync(_storeId, false), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenActiveOnlyIsTrue_ShouldAskForTheInactiveOnesToo()
    {
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(_storeId, true))
            .ReturnsAsync([Driver("Ana"), Driver("Beto", active: false)]);

        var result = await Handler().Handle(new GetDeliveryDriversQuery(ActiveOnly: true), CancellationToken.None);

        result.Data.Should().HaveCount(2);
    }

    /// <summary>Es una lectura pura: no escribe ni guarda nada.</summary>
    [Fact]
    public async Task Handle_ShouldNotWriteAnything()
    {
        _driverRepository.Setup(x => x.GetByStoreIdAsync(_storeId, It.IsAny<bool>())).ReturnsAsync([]);

        await Handler().Handle(new GetDeliveryDriversQuery(), CancellationToken.None);

        _driverRepository.Verify(x => x.AddAsync(It.IsAny<DeliveryDriver>()), Times.Never);
        _driverRepository.Verify(x => x.UpdateAsync(It.IsAny<DeliveryDriver>()), Times.Never);
    }

    /// <summary>
    /// El DTO NO lleva `TenantId`: el aislamiento por tienda ya está resuelto y la vista no
    /// necesita saber el tenant de cada fila.
    /// </summary>
    [Fact]
    public void DeliveryDriverDto_ShouldCarryNoTenantField()
    {
        typeof(DeliveryDriverDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("TenantId");
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto no hay repartidores que listar: se rechaza antes de tocar el
    /// repositorio, y no se adivina ninguna tienda.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReject()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new GetDeliveryDriversQuery(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _driverRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new GetDeliveryDriversQuery(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    #endregion
}
