using Application.Features.SiteTelemetry;
using FluentAssertions;
using Xunit;

namespace Application.Tests.Features.SiteTelemetry
{
    /// <summary>
    /// Lista CERRADA de lo que se mide. Cada caso de aquí es una regla del producto: si alguien
    /// amplía la lista sin querer, estos tests lo dicen.
    /// </summary>
    public class SiteEventCatalogTests
    {
        [Theory]
        [InlineData("/", "/")]
        [InlineData("/login", "/login")]
        [InlineData("/login/", "/login")]
        [InlineData("/register?utm_source=fb", "/register")]
        [InlineData("/private-police", "/private-police")]
        [InlineData("/terms-conditions", "/terms-conditions")]
        public void NormalizePagePath_WithTrackedPage_ReturnsCanonicalPath(string input, string expected)
        {
            SiteEventCatalog.NormalizePagePath(input).Should().Be(expected);
        }

        [Theory]
        [InlineData("/help/tutorial")]
        [InlineData("/diagnostics")]
        [InlineData("/auth/provision")]
        [InlineData("/catalog/mi-tienda")]
        [InlineData("/cualquier-cosa")]
        [InlineData("https://evil.example/login")]
        [InlineData("login")]
        [InlineData("")]
        [InlineData(null)]
        public void NormalizePagePath_WithUntrackedPage_ReturnsNull(string? input)
        {
            SiteEventCatalog.NormalizePagePath(input).Should().BeNull();
        }

        [Theory]
        [InlineData("/api/manual", "/api/manual/")]
        [InlineData("/api/manual/", "/api/manual/")]
        [InlineData("/api/manual/index.html", "/api/manual/")]
        public void TryResolveManualView_WithManualHtml_ReturnsOneCanonicalPath(string input, string expected)
        {
            bool resolved = SiteEventCatalog.TryResolveManualView(input, 200, out string canonical);

            resolved.Should().BeTrue();
            canonical.Should().Be(expected);
        }

        [Fact]
        public void TryResolveManualView_WithPdf_IsASeparateEntryFromTheHtml()
        {
            bool resolved = SiteEventCatalog.TryResolveManualView(
                "/api/manual/manual-usuario-pos.pdf", 200, out string canonical);

            resolved.Should().BeTrue();
            canonical.Should().Be(SiteEventCatalog.ManualPdfPath);
            canonical.Should().NotBe(SiteEventCatalog.ManualHtmlPath);
        }

        [Theory]
        [InlineData("/api/manual/images/04-encabezado.png")]
        [InlineData("/api/manual/images/")]
        [InlineData("/api/manual/otro.html")]
        public void TryResolveManualView_WithManualImageOrUnknownFile_ReturnsFalse(string input)
        {
            SiteEventCatalog.TryResolveManualView(input, 200, out _).Should().BeFalse();
        }

        [Theory]
        [InlineData(304)]
        [InlineData(404)]
        [InlineData(500)]
        public void TryResolveManualView_WithoutStatus200_ReturnsFalse(int statusCode)
        {
            SiteEventCatalog.TryResolveManualView("/api/manual/", statusCode, out _).Should().BeFalse();
        }
    }
}
