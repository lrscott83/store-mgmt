using Domain.Entities.StoreClientErrors;
using FluentAssertions;

namespace Domain.UnitTests.StoreClientErrors
{
    /// <summary>
    /// Invariantes de <see cref="StoreClientError"/> (specs S4 y S5 de `pos-client-error-logs`): las
    /// dos reglas que la tabla documenta se cumplen al construir, no solo en un comentario. Un error
    /// sin mensaje es un error de programación y una fila nunca representa cero ocurrencias.
    /// </summary>
    public class StoreClientErrorTests
    {
        private static readonly DateTime OccurredAt =
            new(2026, 11, 19, 10, 30, 0, DateTimeKind.Utc);

        private static readonly DateTime ReceivedAt =
            new(2026, 11, 19, 10, 30, 5, DateTimeKind.Utc);

        private static StoreClientError.NewStoreClientError Payload(
            string message = "boom",
            int count = 1)
            => new(null, message, null, null, count, null, null, null, OccurredAt, ReceivedAt);

        [Fact]
        public void Create_ShouldClampCountToOne_WhenTheClientSendsZeroOrNegative()
        {
            StoreClientError.Create(Payload(count: 0)).Count.Should().Be(1);
            StoreClientError.Create(Payload(count: -7)).Count.Should().Be(1);
        }

        [Fact]
        public void Create_ShouldKeepCount_WhenTheClientSendsAggregatedOccurrences()
        {
            StoreClientError.Create(Payload(count: 9)).Count.Should().Be(9);
        }

        [Fact]
        public void Create_ShouldTrimTheMessage()
        {
            StoreClientError.Create(Payload("  boom  ")).Message.Should().Be("boom");
        }

        [Fact]
        public void Create_ShouldRejectABlankMessage()
        {
            Action act = () => StoreClientError.Create(Payload("   "));

            act.Should().Throw<ArgumentException>();
        }

        [Fact]
        public void Create_ShouldRejectNullPayload()
        {
            Action act = () => StoreClientError.Create(null!);

            act.Should().Throw<ArgumentNullException>();
        }
    }
}
