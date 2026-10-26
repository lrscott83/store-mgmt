using Application.Abstractions.HttpContext;
using Application.Features.SiteTelemetry.Commands.RecordSitePageViews;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.SiteTelemetry;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Moq;
using Xunit;

namespace Application.Tests.Features.SiteTelemetry
{
    public class RecordSitePageViewsCommandHandlerTests
    {
        private const string DesktopUserAgent =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

        private const string GoogleBotUserAgent =
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

        private readonly Mock<ISiteEventRepository> _siteEventRepository = new();
        private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
        private readonly Mock<IHttpContextService> _httpContextService = new();
        private readonly IConfiguration _configuration;

        public RecordSitePageViewsCommandHandlerTests()
        {
            _httpContextService.SetupGet(x => x.IPAddress).Returns("1.2.3.4");
            _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
            _configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["CatalogTelemetry:Salt"] = "test-salt",
                })
                .Build();
        }

        private RecordSitePageViewsCommandHandler Handler() => new(
            _siteEventRepository.Object,
            _unitOfWork.Object,
            _httpContextService.Object,
            _configuration);

        private static SitePageViewRequest PageView(string path, string? utmSource = null) => new()
        {
            Name = "page_view",
            Path = path,
            Referrer = "https://wa.me/5355555555",
            UtmSource = utmSource,
        };

        [Fact]
        public async Task Handle_WithTrackedPages_PersistsOneRowPerPage()
        {
            List<SiteEvent>? saved = null;
            _siteEventRepository
                .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<SiteEvent>>()))
                .Callback<IEnumerable<SiteEvent>>(items => saved = items.ToList());

            var result = await Handler().Handle(
                new RecordSitePageViewsCommand(DesktopUserAgent,
                    [PageView("/"), PageView("/login", "whatsapp")]),
                CancellationToken.None);

            result.Data.Should().BeTrue();
            saved.Should().NotBeNull();
            saved!.Should().HaveCount(2);
            saved.Should().OnlyContain(x => x.Kind == SiteEventKind.PageView);
            saved.Select(x => x.Path).Should().BeEquivalentTo(["/", "/login"]);
            saved.Should().OnlyContain(x => x.VisitorHash.Length == SiteEvent.HashMaxLength);
            saved.Should().OnlyContain(x => x.SessionHash.Length == SiteEvent.HashMaxLength);
            saved.Single(x => x.Path == "/login").Source.Should().Be(CatalogSource.WhatsApp);
        }

        [Fact]
        public async Task Handle_WithUntrackedOrUnknownPages_PersistsNothing()
        {
            await Handler().Handle(
                new RecordSitePageViewsCommand(DesktopUserAgent,
                    [PageView("/help/tutorial"), PageView("/diagnostics"), PageView("/api/v1/orders")]),
                CancellationToken.None);

            _siteEventRepository.Verify(
                x => x.AddRangeAsync(It.IsAny<IEnumerable<SiteEvent>>()), Times.Never);
            _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        }

        [Fact]
        public async Task Handle_WithBotUserAgent_PersistsNothing()
        {
            await Handler().Handle(
                new RecordSitePageViewsCommand(GoogleBotUserAgent, [PageView("/")]),
                CancellationToken.None);

            _siteEventRepository.Verify(
                x => x.AddRangeAsync(It.IsAny<IEnumerable<SiteEvent>>()), Times.Never);
        }

        [Fact]
        public async Task Handle_WithManualEventName_PersistsNothing()
        {
            await Handler().Handle(
                new RecordSitePageViewsCommand(DesktopUserAgent,
                    [new SitePageViewRequest { Name = "manual_view", Path = "/api/manual/" }]),
                CancellationToken.None);

            _siteEventRepository.Verify(
                x => x.AddRangeAsync(It.IsAny<IEnumerable<SiteEvent>>()), Times.Never);
        }

        [Fact]
        public async Task Handle_WithEmptyBatch_ReturnsFalse()
        {
            var result = await Handler().Handle(
                new RecordSitePageViewsCommand(DesktopUserAgent, []),
                CancellationToken.None);

            result.Data.Should().BeFalse();
        }
    }
}
