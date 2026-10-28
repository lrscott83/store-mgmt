using Application.Features.WebCatalog.Public;
using FluentAssertions;
using Xunit;

namespace Application.Tests.Features.WebCatalog.Public
{
    public class CatalogTelemetryHashTests
    {
        private static readonly Guid StoreId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private static readonly DateTime Noon = new(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void Visitor_IsStableForTheSameStoreDayIpAndUserAgent()
        {
            string first = CatalogTelemetryHash.Visitor(StoreId, "1.2.3.4", "Mozilla/5.0", Noon);
            string second = CatalogTelemetryHash.Visitor(StoreId, "1.2.3.4", "Mozilla/5.0", Noon.AddHours(5));

            first.Should().Be(second);
            first.Should().HaveLength(64);
            first.Should().MatchRegex("^[0-9a-f]{64}$");
        }

        [Fact]
        public void Visitor_ChangesAcrossDaysAndStores()
        {
            string dayOne = CatalogTelemetryHash.Visitor(StoreId, "1.2.3.4", "Mozilla/5.0", Noon);
            string dayTwo = CatalogTelemetryHash.Visitor(StoreId, "1.2.3.4", "Mozilla/5.0", Noon.AddDays(1));
            string otherStore = CatalogTelemetryHash.Visitor(Guid.NewGuid(), "1.2.3.4", "Mozilla/5.0", Noon);

            dayOne.Should().NotBe(dayTwo);
            dayOne.Should().NotBe(otherStore);
        }

        [Fact]
        public void Visitor_ChangesWithTheVisitorInputs()
        {
            string baseline = CatalogTelemetryHash.Visitor(StoreId, "1.2.3.4", "Mozilla/5.0", Noon);
            string otherIp = CatalogTelemetryHash.Visitor(StoreId, "5.6.7.8", "Mozilla/5.0", Noon);
            string otherUa = CatalogTelemetryHash.Visitor(StoreId, "1.2.3.4", "Other/1.0", Noon);

            baseline.Should().NotBe(otherIp);
            baseline.Should().NotBe(otherUa);
        }

        [Fact]
        public void Session_GroupsEventsInTheSameThirtyMinuteWindow()
        {
            string visitor = CatalogTelemetryHash.Visitor(StoreId, "1.2.3.4", "Mozilla/5.0", Noon);
            string atNoon = CatalogTelemetryHash.Session(StoreId, visitor, Noon);
            string atTwentyNine = CatalogTelemetryHash.Session(StoreId, visitor, Noon.AddMinutes(29));
            string atThirty = CatalogTelemetryHash.Session(StoreId, visitor, Noon.AddMinutes(30));

            atNoon.Should().Be(atTwentyNine);
            atNoon.Should().NotBe(atThirty);
        }
    }
}
