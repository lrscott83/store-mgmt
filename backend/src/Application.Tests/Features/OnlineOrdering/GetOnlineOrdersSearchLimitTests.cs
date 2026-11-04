using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrders;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El tope del término de búsqueda del listado (S2, hallazgo 6.3).
///
/// Lo que se fija: 64 caracteres se aceptan y llegan al repositorio ya recortados; 65 son un 400
/// ANTES de tocar la base y la petición no llega al repositorio. Se rechaza en vez de truncar
/// porque truncar devolvería resultados de una búsqueda que nadie pidió, sin decirlo.
///
/// Los dos lados del límite se prueban explícitamente (64 y 65) porque un `>` convertido en `>=`
/// pasaría un test que solo probara números redondos lejanos al tope.
/// </summary>
public class GetOnlineOrdersSearchLimitTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public GetOnlineOrdersSearchLimitTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(
                It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PagedOrders(new List<Order>(), 0));
    }

    private GetOnlineOrdersQueryHandler Handler() => new(
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object);

    [Fact]
    public async Task Handle_WithATermOfExactlySixtyFourCharacters_ShouldSearchWithIt()
    {
        OrderListFilter? captured = null;
        _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(
                It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .Callback<Guid, OrderListFilter, int, int, CancellationToken>(
                (_, filter, _, _, _) => captured = filter)
            .ReturnsAsync(new PagedOrders(new List<Order>(), 0));

        string term = new('a', 64);
        var result = await Handler().Handle(
            new GetOnlineOrdersQuery(Search: term), CancellationToken.None);

        result.Succeeded.Should().BeTrue("64 es el límite y sigue siendo válido");
        captured.Should().NotBeNull();
        captured!.Search.Should().Be(term);
    }

    /// <summary>
    /// El recorte ocurre ANTES de medir: 64 caracteres rodeados de espacios siguen siendo 64, y un
    /// tope que se midiera sobre el valor crudo rechazaría una búsqueda que la persona escribió
    /// bien.
    /// </summary>
    [Fact]
    public async Task Handle_WithASixtyFourCharacterTermSurroundedBySpaces_ShouldAcceptItTrimmed()
    {
        OrderListFilter? captured = null;
        _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(
                It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .Callback<Guid, OrderListFilter, int, int, CancellationToken>(
                (_, filter, _, _, _) => captured = filter)
            .ReturnsAsync(new PagedOrders(new List<Order>(), 0));

        string term = new('a', 64);
        var result = await Handler().Handle(
            new GetOnlineOrdersQuery(Search: $"   {term}   "), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        captured!.Search.Should().Be(term);
    }

    [Fact]
    public async Task Handle_WithATermOfSixtyFiveCharacters_ShouldReportBadRequest()
    {
        Func<Task> act = () => Handler().Handle(
            new GetOnlineOrdersQuery(Search: new string('a', 65)), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// El mensaje dice el tope: un 400 sin motivo deja al cliente adivinando cuánto recortar.
    /// </summary>
    [Fact]
    public async Task Handle_WithATermOfSixtyFiveCharacters_ShouldNameTheLimitInTheMessage()
    {
        Func<Task> act = () => Handler().Handle(
            new GetOnlineOrdersQuery(Search: new string('a', 65)), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.Message.Should().Contain("64");
    }

    /// <summary>
    /// Rechazar es barato solo si ocurre ANTES de la consulta: el término desmedido es justo el que
    /// no puede llegar a un `LIKE '%…%'` sobre el histórico completo.
    /// </summary>
    [Fact]
    public async Task Handle_WithATermOfSixtyFiveCharacters_ShouldNotQueryTheRepository()
    {
        Func<Task> act = () => Handler().Handle(
            new GetOnlineOrdersQuery(Search: new string('a', 65)), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
