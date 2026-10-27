using Application.Abstractions.HttpContext;
using Application.Features.WebCatalog.Public.Commands.RecordCatalogEvents;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.CatalogEvents;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Features.WebCatalog.Public
{
    public class RecordCatalogEventsCommandHandlerTests
    {
        private const string StoreSlug = "mi-tienda";
        private const string DesktopUserAgent =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

        private readonly Mock<IStoreRepository> _storeRepository = new();
        private readonly Mock<ICatalogEventRepository> _catalogEventRepository = new();
        private readonly Mock<IProductRepository> _productRepository = new();
        private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
        private readonly Mock<IHttpContextService> _httpContextService = new();
        private readonly Guid _tenantId = Guid.NewGuid();
        private Store _store = null!;

        public RecordCatalogEventsCommandHandlerTests()
        {
            _httpContextService.SetupGet(x => x.IPAddress).Returns("1.2.3.4");
            _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
            _productRepository
                .Setup(x => x.GetPublishedByIdsAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>()))
                .ReturnsAsync([]);

            _store = Store.Create("Tienda", Guid.NewGuid(), true, _tenantId);
            _store.CatalogSlug = StoreSlug;
            _storeRepository
                .Setup(x => x.GetStoreByCatalogSlugAsync(StoreSlug))
                .ReturnsAsync(_store);
        }

        private RecordCatalogEventsCommandHandler Handler() => new(
            _storeRepository.Object,
            _catalogEventRepository.Object,
            _productRepository.Object,
            _unitOfWork.Object,
            _httpContextService.Object);

        private static CatalogEventRequest PageView(string path = "/catalog/mi-tienda") => new()
        {
            Name = "page_view",
            Path = path,
        };

        [Fact]
        public async Task Handle_WithValidEvents_PersistsAnonymousHashesAndSource()
        {
            List<CatalogEvent>? saved = null;
            _catalogEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()))
                .Callback<IEnumerable<CatalogEvent>>(items => saved = items.ToList())
                .Returns(Task.CompletedTask);

            Guid productId = Guid.NewGuid();
            _productRepository
                .Setup(x => x.GetPublishedByIdsAsync(_store.Id, It.IsAny<IReadOnlyCollection<Guid>>()))
                .ReturnsAsync([
                    Product.Create(productId, "Camisa", Guid.NewGuid(), 100m, 1, true, false, "b1", _tenantId),
                ]);
            var command = new RecordCatalogEventsCommand(StoreSlug, DesktopUserAgent, [
                PageView(),
                new CatalogEventRequest
                {
                    Name = "product_view",
                    Path = "/catalog/mi-tienda",
                    ProductId = productId,
                    UtmSource = "whatsapp",
                },
            ]);

            var result = await Handler().Handle(command, CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            saved.Should().NotBeNull();
            saved!.Should().HaveCount(2);
            saved.Should().OnlyContain(item => item.StoreId == _store.Id && item.TenantId == _tenantId);
            saved.Should().OnlyContain(item => item.VisitorHash.Length == 64 && item.SessionHash.Length == 64);
            saved.Should().OnlyContain(item => item.DeviceType == CatalogDeviceType.Desktop);
            saved![0].Source.Should().Be(CatalogSource.Direct);
            saved[0].Path.Should().Be("/catalog/mi-tienda");
            saved[0].ProductId.Should().BeNull();
            saved[1].Source.Should().Be(CatalogSource.WhatsApp);
            saved[1].ProductId.Should().Be(productId);
            _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        }

        [Fact]
        public async Task Handle_WithPageViewCarryingAProductId_DoesNotStoreIt()
        {
            List<CatalogEvent>? saved = null;
            _catalogEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()))
                .Callback<IEnumerable<CatalogEvent>>(items => saved = items.ToList())
                .Returns(Task.CompletedTask);

            var command = new RecordCatalogEventsCommand(StoreSlug, DesktopUserAgent, [
                new CatalogEventRequest { Name = "page_view", ProductId = Guid.NewGuid() },
            ]);

            await Handler().Handle(command, CancellationToken.None);

            saved!.Single().ProductId.Should().BeNull();
        }

        [Fact]
        public async Task Handle_WithBotUserAgent_WritesNothing()
        {
            var command = new RecordCatalogEventsCommand(StoreSlug,
                "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", [PageView()]);

            await Handler().Handle(command, CancellationToken.None);

            _catalogEventRepository.Verify(
                x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()), Times.Never);
            _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        }

        [Fact]
        public async Task Handle_WithUnknownSlug_WritesNothing()
        {
            _storeRepository
                .Setup(x => x.GetStoreByCatalogSlugAsync("no-existe"))
                .ReturnsAsync((Store?)null);

            var command = new RecordCatalogEventsCommand("no-existe", DesktopUserAgent, [PageView()]);

            var result = await Handler().Handle(command, CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            _catalogEventRepository.Verify(
                x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()), Times.Never);
        }

        [Fact]
        public async Task Handle_WithMoreThanTenEvents_PersistsAtMostTen()
        {
            List<CatalogEvent>? saved = null;
            _catalogEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()))
                .Callback<IEnumerable<CatalogEvent>>(items => saved = items.ToList())
                .Returns(Task.CompletedTask);

            var command = new RecordCatalogEventsCommand(StoreSlug, DesktopUserAgent,
                Enumerable.Range(0, 15).Select(_ => PageView()).ToList());

            await Handler().Handle(command, CancellationToken.None);

            saved!.Should().HaveCount(10);
        }

        [Fact]
        public async Task Handle_WithInvalidEventNames_SkipsThem()
        {
            List<CatalogEvent>? saved = null;
            _catalogEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()))
                .Callback<IEnumerable<CatalogEvent>>(items => saved = items.ToList())
                .Returns(Task.CompletedTask);

            var command = new RecordCatalogEventsCommand(StoreSlug, DesktopUserAgent, [
                new CatalogEventRequest { Name = "purchase" },
                PageView(),
            ]);

            await Handler().Handle(command, CancellationToken.None);

            saved!.Should().ContainSingle();
            saved[0].Type.Should().Be(CatalogEventType.PageView);
        }
        [Fact]
        public async Task Handle_WithUnknownProduct_DoesNotStoreTheProductId()
        {
            List<CatalogEvent>? saved = null;
            _catalogEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()))
                .Callback<IEnumerable<CatalogEvent>>(items => saved = items.ToList())
                .Returns(Task.CompletedTask);

            var command = new RecordCatalogEventsCommand(StoreSlug, DesktopUserAgent, [
                new CatalogEventRequest { Name = "product_view", ProductId = Guid.NewGuid() },
            ]);

            await Handler().Handle(command, CancellationToken.None);

            saved!.Single().ProductId.Should().BeNull();
        }

        [Fact]
        public async Task Handle_WithExternalPath_FallsBackToTheCanonicalCatalogPath()
        {
            List<CatalogEvent>? saved = null;
            _catalogEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()))
                .Callback<IEnumerable<CatalogEvent>>(items => saved = items.ToList())
                .Returns(Task.CompletedTask);

            var command = new RecordCatalogEventsCommand(StoreSlug, DesktopUserAgent, [
                PageView("https://evil.example/catalog/mi-tienda"),
            ]);

            await Handler().Handle(command, CancellationToken.None);

            saved!.Single().Path.Should().Be("/catalog/mi-tienda");
        }

        [Fact]
        public async Task Handle_WithNullEvent_SkipsItWithoutBreakingTheBatch()
        {
            List<CatalogEvent>? saved = null;
            _catalogEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<CatalogEvent>>()))
                .Callback<IEnumerable<CatalogEvent>>(items => saved = items.ToList())
                .Returns(Task.CompletedTask);

            var command = new RecordCatalogEventsCommand(StoreSlug, DesktopUserAgent, [null!, PageView()]);

            await Handler().Handle(command, CancellationToken.None);

            saved!.Should().ContainSingle();
        }
    }
}
