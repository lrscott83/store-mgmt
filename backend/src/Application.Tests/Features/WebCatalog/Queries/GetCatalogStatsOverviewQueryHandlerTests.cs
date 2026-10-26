using Application.Features.WebCatalog.Queries.GetCatalogStatsOverview;
using Domain.Common.Enums;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Features.WebCatalog.Queries
{
    public class GetCatalogStatsOverviewQueryHandlerTests
    {
        private readonly Mock<ICatalogEventRepository> _catalogEventRepository = new();
        private readonly Mock<IOrderRepository> _orderRepository = new();
        private readonly Mock<IProductRepository> _productRepository = new();
        private readonly Guid _storeId = Guid.NewGuid();
        private readonly Guid _quietStoreId = Guid.NewGuid();

        private GetCatalogStatsOverviewQueryHandler Handler() => new(
            _catalogEventRepository.Object,
            _orderRepository.Object,
            _productRepository.Object);

        private void SetupSnapshot(CatalogOverviewSnapshot snapshot)
        {
            _catalogEventRepository
                .Setup(x => x.GetOverviewStatsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(snapshot);
            _orderRepository
                .Setup(x => x.CountOnlineOrdersAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                .ReturnsAsync(0);
        }

        [Fact]
        public async Task Handle_MapsGlobalTotalsAndStoresWithVisits()
        {
            Guid productId = Guid.NewGuid();
            DateTime today = DateTime.UtcNow.Date;
            SetupSnapshot(new CatalogOverviewSnapshot(
                new CatalogStatsSnapshot(
                    PageViews: 10,
                    Visits: 5,
                    Visitors: 4,
                    Sources: [new CatalogSourceVisits(CatalogSource.WhatsApp, 3)],
                    TopProducts: [new CatalogProductViews(productId, 7)],
                    Daily: [new CatalogDayVisits(today, 5)]),
                [
                    new CatalogStoreVisits(_storeId, "Tienda Uno", 4),
                ]));
            _orderRepository
                .Setup(x => x.CountOnlineOrdersAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                .ReturnsAsync(2);
            _productRepository
                .Setup(x => x.GetNamesByIdsAsync(
                    It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new Dictionary<Guid, string> { [productId] = "Camisa" });

            var result = await Handler().Handle(new GetCatalogStatsOverviewQuery(30), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            result.Data.Totals.Visits.Should().Be(5);
            result.Data.Totals.Visitors.Should().Be(4);
            result.Data.Totals.PageViews.Should().Be(10);
            result.Data.Totals.Orders.Should().Be(2);
            result.Data.Totals.ConversionRate.Should().Be(0.4);
            result.Data.Totals.Sources.Should().HaveCount(Enum.GetValues<CatalogSource>().Length);
            result.Data.Totals.Sources.Single(s => s.Source == CatalogSource.WhatsApp).Visits.Should().Be(3);
            result.Data.Totals.TopProducts.Should().ContainSingle()
                .Which.Should().BeEquivalentTo(new { ProductId = productId, Name = "Camisa", Views = 7 });
            result.Data.Totals.Daily.Should().HaveCount(30);
            result.Data.Totals.Daily.Should().Contain(day => day.Visits == 5);

            // El repositorio entrega solo tiendas con visitas; el handler no reordena ni filtra.
            result.Data.Stores.Should().ContainSingle();
            result.Data.Stores[0].Should()
                .BeEquivalentTo(new { StoreId = _storeId, Name = "Tienda Uno", Visits = 4 });
        }

        [Fact]
        public async Task Handle_UsesTheGlobalOrderCount()
        {
            SetupSnapshot(new CatalogOverviewSnapshot(
                new CatalogStatsSnapshot(0, 0, 0, [], [], []), []));

            await Handler().Handle(new GetCatalogStatsOverviewQuery(7), CancellationToken.None);

            _orderRepository.Verify(
                x => x.CountOnlineOrdersAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()), Times.Once);
        }

        [Fact]
        public async Task Handle_PassesTheSameUtcWindowToEventsAndOrders()
        {
            DateTime? eventsFrom = null;
            DateTime? eventsTo = null;
            DateTime? ordersFrom = null;
            DateTime? ordersTo = null;

            _catalogEventRepository
                .Setup(x => x.GetOverviewStatsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                    It.IsAny<CancellationToken>()))
                .Callback<DateTime, DateTime, CancellationToken>((from, to, _) =>
                {
                    eventsFrom = from;
                    eventsTo = to;
                })
                .ReturnsAsync(new CatalogOverviewSnapshot(
                    new CatalogStatsSnapshot(0, 0, 0, [], [], []), []));
            _orderRepository
                .Setup(x => x.CountOnlineOrdersAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                .Callback<DateTime, DateTime>((from, to) =>
                {
                    ordersFrom = from;
                    ordersTo = to;
                })
                .ReturnsAsync(0);

            await Handler().Handle(new GetCatalogStatsOverviewQuery(7), CancellationToken.None);

            eventsFrom.Should().NotBeNull();
            eventsTo.Should().NotBeNull();
            eventsTo!.Value.Date.Should().Be(DateTime.UtcNow.Date);
            eventsFrom.Should().Be(eventsTo!.Value.Date.AddDays(-6));
            ordersFrom.Should().Be(eventsFrom);
            ordersTo.Should().Be(eventsTo);
        }

        [Fact]
        public async Task Handle_WithNoVisits_ReturnsZeroConversionAndNoStores()
        {
            SetupSnapshot(new CatalogOverviewSnapshot(
                new CatalogStatsSnapshot(0, 0, 0, [], [], []), []));

            var result = await Handler().Handle(new GetCatalogStatsOverviewQuery(7), CancellationToken.None);

            result.Data.Totals.Visits.Should().Be(0);
            result.Data.Totals.ConversionRate.Should().Be(0);
            result.Data.Totals.Daily.Should().HaveCount(7);
            result.Data.Totals.TopProducts.Should().BeEmpty();
            result.Data.Stores.Should().BeEmpty();
        }

        [Theory]
        [InlineData(0, 30)]
        [InlineData(-5, 30)]
        [InlineData(500, 365)]
        [InlineData(7, 7)]
        public async Task Handle_ClampsTheWindow(int requestedDays, int expectedDays)
        {
            SetupSnapshot(new CatalogOverviewSnapshot(
                new CatalogStatsSnapshot(0, 0, 0, [], [], []), []));

            var result = await Handler().Handle(new GetCatalogStatsOverviewQuery(requestedDays),
                CancellationToken.None);

            result.Data.Totals.Days.Should().Be(expectedDays);
            result.Data.Totals.Daily.Should().HaveCount(expectedDays);
        }
    }
}
