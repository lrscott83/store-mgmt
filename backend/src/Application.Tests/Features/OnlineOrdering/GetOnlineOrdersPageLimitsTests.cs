using Application.Abstractions.HttpContext;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrders;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El tope de página del listado (S1, hallazgo 6.2).
///
/// `?page=2147483647` no era "una página muy alta": `(page - 1) * pageSize` se calculaba en `int`,
/// desbordaba a un `Skip` NEGATIVO y PostgreSQL respondía con un 500. Lo que se fija aquí es el
/// comportamiento observable de la corrección: la respuesta es un éxito, la página que se publica
/// es la acotada, y el `skip` que llega al repositorio sale de esa página acotada, nunca negativo.
///
/// Los dos extremos se prueban porque son dos desbordamientos distintos: por arriba el producto, por
/// abajo `page - 1` sobre <see cref="int.MinValue"/>.
/// </summary>
public class GetOnlineOrdersPageLimitsTests
{
    private const int MaxPage = 10_000;

    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public GetOnlineOrdersPageLimitsTests()
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

    /// <summary>
    /// El caso exacto del hallazgo: la página más grande que cabe en un `int` devuelve un ÉXITO con
    /// una página real. Antes, el `Skip` desbordaba a negativo y la petición terminaba en 500.
    /// </summary>
    [Fact]
    public async Task Handle_WithTheLargestPossiblePage_ShouldAnswerWithARealPageInsteadOfFailing()
    {
        var result = await Handler().Handle(
            new GetOnlineOrdersQuery(Page: int.MaxValue, PageSize: 20), CancellationToken.None);

        result.Succeeded.Should().BeTrue("una página absurda es una entrada válida, no un error del servidor");
        result.Data!.Page.Should().Be(MaxPage, "la página publicada es la YA acotada, no la pedida");
        result.Data.PageSize.Should().Be(20);
        result.Data.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WithTheLargestPossiblePage_ShouldSkipFromTheClampedPageAndNeverNegatively()
    {
        await Handler().Handle(
            new GetOnlineOrdersQuery(Page: int.MaxValue, PageSize: 20), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId,
                It.IsAny<OrderListFilter>(),
                (MaxPage - 1) * 20,
                20,
                It.IsAny<CancellationToken>()),
            Times.Once);
        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.Is<int>(skip => skip < 0),
                It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "un `Skip` negativo no es una página vacía: es un error de la base");
    }

    /// <summary>
    /// El extremo inferior: `int.MinValue` es tan absurdo como el superior y tiene su propio
    /// desbordamiento (`page - 1`). Se normaliza a la primera página, con `skip = 0`.
    /// </summary>
    [Fact]
    public async Task Handle_WithTheSmallestPossiblePage_ShouldNormalizeToTheFirstPage()
    {
        var result = await Handler().Handle(
            new GetOnlineOrdersQuery(Page: int.MinValue), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Page.Should().Be(1);
        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.IsAny<OrderListFilter>(), 0, It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    /// <summary>
    /// El tope no acorta la página: el `skip` se calcula con el tamaño de página normalizado, así
    /// que una página grande con `pageSize` grande no solapa ni salta de más.
    /// </summary>
    [Fact]
    public async Task Handle_WithTheLargestPageAndTheLargestPageSize_ShouldCombineBothCaps()
    {
        var result = await Handler().Handle(
            new GetOnlineOrdersQuery(Page: int.MaxValue, PageSize: int.MaxValue), CancellationToken.None);

        result.Data!.Page.Should().Be(MaxPage);
        result.Data.PageSize.Should().Be(100);
        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId,
                It.IsAny<OrderListFilter>(),
                (MaxPage - 1) * 100,
                100,
                It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
