using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.UnitOfWorks;
using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Dar de alta un repartidor (F7) es un catálogo de personas, y este suite fija las tres cosas que
/// lo hacen correcto:
///
///   1. El repartidor nace en la tienda y el tenant del CONTEXTO, nunca los que venga en el
///      cuerpo. Aceptarlos dejaría que un dueño creara repartidores en la tienda de otro.
///   2. Nombre y teléfono se limpian de espacios, y el tenant es el de la petición.
///   3. El alta NO decide nada de pedidos: un repartidor nuevo no está asignado a nada, y eso es
///      un acto sobre un pedido que pertenece a F5.
///
/// Lo que NO hace: comprobar duplicados por nombre. `DeliveryDriver` no lleva índice único
/// (su configuración lo dice explícitamente): dos repartidores con el mismo nombre son dos
/// personas distintas, y bloquear el alta por un texto sería impedir algo legítimo.
/// </summary>
public class CreateDeliveryDriverCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IDeliveryDriverRepository> _driverRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    /// <summary>Lo que realmente se pasó al repositorio, para inspeccionarlo después.</summary>
    private DeliveryDriver? _persisted;

    public CreateDeliveryDriverCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _driverRepository
            .Setup(x => x.AddAsync(It.IsAny<DeliveryDriver>()))
            .Returns((DeliveryDriver d) => Task.FromResult(d))
            .Callback<DeliveryDriver>(d => _persisted = d);
    }

    private CreateDeliveryDriverCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _driverRepository.Object,
        _localizer.Object);

    private static CreateDeliveryDriverCommand Command(string name = "Ana", string phone = "+5351111111")
        => new() { Name = name, Phone = phone };

    #region Happy Path

    [Fact]
    public async Task Handle_ShouldCreateTheDriverForTheStoreAndTenantInContext()
    {
        var result = await Handler().Handle(Command(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();

        _driverRepository.Verify(x => x.AddAsync(It.Is<DeliveryDriver>(d =>
            d.StoreId == _storeId
            && d.TenantId == _tenantId
            && d.Name == "Ana"
            && d.Phone == "+5351111111")), Times.Once);
    }

    /// <summary>Un repartidor nuevo está activo: se acaba de dar de alta, no se reactiva.</summary>
    [Fact]
    public async Task Handle_ShouldCreateTheDriverAlreadyActive()
    {
        var result = await Handler().Handle(Command(), CancellationToken.None);

        result.Data!.IsActive.Should().BeTrue();
    }

    /// <summary>
    /// El texto se limpia de espacios: un teléfono con espacios rompería el enlace que el dueño
    /// marca en el móvil, y un nombre con bordes se vería mal en la lista.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldTrimTheNameAndThePhone()
    {
        var result = await Handler().Handle(
            Command(name: "  Ana  ", phone: "  +5351111111  "), CancellationToken.None);

        result.Data!.Name.Should().Be("Ana");
        result.Data.Phone.Should().Be("+5351111111");
    }

    [Fact]
    public async Task Handle_ShouldSaveTheChangesOnce()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// El alta NO toca pedidos ni repartidores ajenos: solo se escribe la fila nueva. La
    /// asignación de un pedido a un repartidor es de F5.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNotReadAnyExistingDriver()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _driverRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()), Times.Never);
        _driverRepository.Verify(x => x.GetByIdAsync(It.IsAny<Guid>()), Times.Never);
        _driverRepository.Verify(x => x.UpdateAsync(It.IsAny<DeliveryDriver>()), Times.Never);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto el repartidor no tiene de quién ser: se rechaza antes de tocar el
    /// repositorio.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReject()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _driverRepository.Verify(x => x.AddAsync(It.IsAny<DeliveryDriver>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    #endregion
}
