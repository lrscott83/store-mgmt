using Application.Features.WebCatalog.Public;
using Domain.Common.Enums;
using FluentAssertions;
using Xunit;

namespace Application.Tests.Features.WebCatalog.Public
{
    public class CatalogSourceClassifierTests
    {
        [Fact]
        public void Resolve_WithoutReferrerOrUtm_ReturnsDirect()
        {
            (CatalogSource source, string? host) = CatalogSourceClassifier.Resolve(null, null, null);

            source.Should().Be(CatalogSource.Direct);
            host.Should().BeNull();
        }

        [Theory]
        [InlineData("whatsapp")]
        [InlineData("Wa")]
        [InlineData("whatsapp-business")]
        public void Resolve_WhatsAppUtm_ReturnsWhatsApp(string utmSource)
        {
            (CatalogSource source, _) = CatalogSourceClassifier.Resolve(utmSource, "social", null);

            source.Should().Be(CatalogSource.WhatsApp);
        }

        [Theory]
        [InlineData("https://l.instagram.com/?u=abc", CatalogSource.Instagram, "l.instagram.com")]
        [InlineData("https://lm.facebook.com/l.php?u=abc", CatalogSource.Facebook, "lm.facebook.com")]
        [InlineData("https://www.google.com/search?q=tienda", CatalogSource.Google, "google.com")]
        [InlineData("https://example.com/post", CatalogSource.Referral, "example.com")]
        [InlineData("https://wa.me/5355555555", CatalogSource.WhatsApp, "wa.me")]
        public void Resolve_ReferrerHost_IsClassified(string referrer, CatalogSource expected,
            string expectedHost)
        {
            (CatalogSource source, string? host) = CatalogSourceClassifier.Resolve(null, null, referrer);

            source.Should().Be(expected);
            host.Should().Be(expectedHost);
        }

        [Fact]
        public void Resolve_UnknownUtm_ReturnsCampaign()
        {
            (CatalogSource source, _) = CatalogSourceClassifier.Resolve("newsletter", "email", null);

            source.Should().Be(CatalogSource.Campaign);
        }

        [Fact]
        public void Resolve_UtmWinsOverTheReferrer()
        {
            (CatalogSource source, string? host) = CatalogSourceClassifier.Resolve(
                "whatsapp", "social", "https://www.google.com/search?q=tienda");

            source.Should().Be(CatalogSource.WhatsApp);
            host.Should().Be("google.com");
        }

        [Fact]
        public void Resolve_InvalidReferrer_FallsBackToDirect()
        {
            (CatalogSource source, string? host) = CatalogSourceClassifier.Resolve(null, null, "not a url");

            source.Should().Be(CatalogSource.Direct);
            host.Should().BeNull();
        }
    }
}
