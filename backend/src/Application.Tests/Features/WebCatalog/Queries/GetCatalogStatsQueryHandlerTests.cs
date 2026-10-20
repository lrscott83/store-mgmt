using Application.Features.WebCatalog.Queries.GetCatalogStats;
using Domain.Common.Enums;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Features.WebCatalog.Queries
{
    public class GetCatalogStatsQueryHandlerTests
    {
        private readonly Mock<ICatalogEventRepository> _catalogEventRepository = new();
        private readonly Mock<IOrderRepository> _orderRepository = new();
        private readonly Mock<IProductRepository> _productRepository = new();
        private readonly Guid _storeId = Guid.NewGuid();

        private GetCatalogStatsQueryHandler Handler() => new(
            _catalogEventRepository.Object,
            _orderRepository.Object,
            _productRepository.Object);

        [Fact]
        public async Task Handle_MapsSnapshotOrdersSourcesAndTopProducts()
        {
            Guid productId = Guid.NewGuid();
            DateTime today = DateTime.UtcNow.Date;
            _catalogEventRepository
                .Setup(x => x.GetStatsAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(new CatalogStatsSnapshot(
                    PageViews: 10,
                    Visits: 5,
                    Visitors: 4,
                    Sources:
                    [
                        new CatalogSourceVisits(CatalogSource.WhatsApp, 3),
                        new CatalogSourceVisits(CatalogSource.Direct, 2),
                    ],
                    TopProducts: [new CatalogProductViews(productId, 7)],
                    Daily: [new CatalogDayVisits(today, 5)]));
            _orderRepository
                .Setup(x => x.CountOnlineOrdersAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                .ReturnsAsync(2);
            Product product = Product.Create(productId, "Camisa", Guid.NewGuid(), 100m, 1, true, false,
                "b1", Guid.NewGuid());
            _productRepository.Setup(x => x.GetByIdAsync(productId)).ReturnsAsync(product);

            var result = await Handler().Handle(new GetCatalogStatsQuery(_storeId, 30), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            result.Data.Visits.Should().Be(5);
            result.Data.Visitors.Should().Be(4);
            result.Data.PageViews.Should().Be(10);
            result.Data.Orders.Should().Be(2);
            result.Data.ConversionRate.Should().Be(0.4);
            result.Data.Sources.Should().HaveCount(Enum.GetValues<CatalogSource>().Length);
            result.Data.Sources.Single(s => s.Source == CatalogSource.WhatsApp).Visits.Should().Be(3);
            result.Data.Sources.Single(s => s.Source == CatalogSource.Direct).Visits.Should().Be(2);
            result.Data.TopProducts.Should().ContainSingle()
                .Which.Should().BeEquivalentTo(new { ProductId = productId, Name = "Camisa", Views = 7 });
            result.Data.Daily.Should().HaveCount(30);
            result.Data.Daily.Should().Contain(day => day.Visits == 5);
        }

        [Fact]
        public async Task Handle_PassesTheSameUtcWindowToEventsAndOrders()
        {
            DateTime? eventsFrom = null;
            DateTime? eventsTo = null;
            DateTime? ordersFrom = null;
            DateTime? ordersTo = null;

            _catalogEventRepository
                .Setup(x => x.GetStatsAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                    It.IsAny<CancellationToken>()))
                .Callback<Guid, DateTime, DateTime, CancellationToken>((_, from, to, _) =>
                {
                    eventsFrom = from;
                    eventsTo = to;
                })
                .ReturnsAsync(new CatalogStatsSnapshot(0, 0, 0, [], [], []));
            _orderRepository
                .Setup(x => x.CountOnlineOrdersAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                .Callback<Guid, DateTime, DateTime>((_, from, to) =>
                {
                    ordersFrom = from;
                    ordersTo = to;
                })
                .ReturnsAsync(0);

            await Handler().Handle(new GetCatalogStatsQuery(_storeId, 7), CancellationToken.None);

            eventsFrom.Should().NotBeNull();
            eventsTo.Should().NotBeNull();
            eventsTo!.Value.Date.Should().Be(DateTime.UtcNow.Date);
            eventsFrom.Should().Be(eventsTo!.Value.Date.AddDays(-6));
            ordersFrom.Should().Be(eventsFrom);
            ordersTo.Should().Be(eventsTo);
        }

        [Fact]
        public async Task Handle_WithNoVisits_ReturnsZeroConversion()
        {
            _catalogEventRepository
                .Setup(x => x.GetStatsAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(new CatalogStatsSnapshot(0, 0, 0, [], [], []));
            _orderRepository
                .Setup(x => x.CountOnlineOrdersAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                .ReturnsAsync(0);

            var result = await Handler().Handle(new GetCatalogStatsQuery(_storeId, 7), CancellationToken.None);

            result.Data.Visits.Should().Be(0);
            result.Data.ConversionRate.Should().Be(0);
            result.Data.Daily.Should().HaveCount(7);
            result.Data.TopProducts.Should().BeEmpty();
        }

        [Theory]
        [InlineData(0, 30)]
        [InlineData(-5, 30)]
        [InlineData(500, 365)]
        [InlineData(7, 7)]
        public async Task Handle_ClampsTheWindow(int requestedDays, int expectedDays)
        {
            _catalogEventRepository
                .Setup(x => x.GetStatsAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>(),
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(new CatalogStatsSnapshot(0, 0, 0, [], [], []));
            _orderRepository
                .Setup(x => x.CountOnlineOrdersAsync(_storeId, It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                .ReturnsAsync(0);

            var result = await Handler().Handle(new GetCatalogStatsQuery(_storeId, requestedDays),
                CancellationToken.None);

            result.Data.Days.Should().Be(expectedDays);
            result.Data.Daily.Should().HaveCount(expectedDays);
        }
    }
}
