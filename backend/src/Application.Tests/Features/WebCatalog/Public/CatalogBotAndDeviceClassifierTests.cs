using Application.Features.WebCatalog.Public;
using Domain.Common.Enums;
using FluentAssertions;
using Xunit;

namespace Application.Tests.Features.WebCatalog.Public
{
    public class CatalogBotDetectorTests
    {
        [Theory]
        [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", false)]
        [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", false)]
        [InlineData("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", true)]
        [InlineData("curl/8.4.0", true)]
        [InlineData("Mozilla/5.0 (compatible; bingbot/2.0)", true)]
        [InlineData("", true)]
        [InlineData(null, true)]
        public void IsBot_ClassifiesCommonUserAgents(string? userAgent, bool expected)
        {
            CatalogBotDetector.IsBot(userAgent).Should().Be(expected);
        }
    }

    public class CatalogDeviceClassifierTests
    {
        [Theory]
        [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", CatalogDeviceType.Desktop)]
        [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148", CatalogDeviceType.Mobile)]
        [InlineData("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36", CatalogDeviceType.Mobile)]
        [InlineData("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", CatalogDeviceType.Tablet)]
        [InlineData(null, CatalogDeviceType.Unknown)]
        public void Resolve_MapsUserAgentToDevice(string? userAgent, CatalogDeviceType expected)
        {
            CatalogDeviceClassifier.Resolve(userAgent).Should().Be(expected);
        }
    }
}
