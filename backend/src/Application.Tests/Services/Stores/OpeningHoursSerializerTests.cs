using Application.Services.Stores;
using FluentAssertions;

namespace Application.Tests.Services.Stores;

/// <summary>
/// public-catalog-static-pages (T8): el horario público se guarda como JSON canónico y se vuelve
/// a leer para el JSON-LD. Estas pruebas fijan el contrato: qué se acepta, cómo se canonicaliza y
/// qué pasa con una fila guardada inválida (se ignora antes que publicar un horario imposible).
/// </summary>
public class OpeningHoursSerializerTests
{
    private static OpeningHoursEntry Entry(string day, string opens, string closes) =>
        new(day, opens, closes);

    [Fact]
    public void TryNormalize_EmptyOrNull_ProducesNullJson()
    {
        OpeningHoursSerializer.TryNormalize(null, out var nullJson, out var nullError)
            .Should().BeTrue();
        nullJson.Should().BeNull();
        nullError.Should().BeNull();

        OpeningHoursSerializer.TryNormalize(Array.Empty<OpeningHoursEntry>(), out var emptyJson, out _)
            .Should().BeTrue();
        emptyJson.Should().BeNull();
    }

    [Fact]
    public void TryNormalize_ValidEntries_ProducesCanonicalJsonSortedByDayThenOpening()
    {
        var entries = new[]
        {
            Entry("Sunday", "10:00", "14:00"),
            Entry("Monday", "18:00", "23:00"),
            Entry("Monday", "09:00", "13:00"),
        };

        OpeningHoursSerializer.TryNormalize(entries, out var json, out var error).Should().BeTrue();

        error.Should().BeNull();
        json.Should().Be(
            "[{\"day\":\"Monday\",\"opens\":\"09:00\",\"closes\":\"13:00\"}," +
            "{\"day\":\"Monday\",\"opens\":\"18:00\",\"closes\":\"23:00\"}," +
            "{\"day\":\"Sunday\",\"opens\":\"10:00\",\"closes\":\"14:00\"}]");
    }

    [Theory]
    [InlineData("Lunes")]
    [InlineData("monday")]
    [InlineData("")]
    public void TryNormalize_UnknownDay_ReturnsDayError(string day)
    {
        OpeningHoursSerializer.TryNormalize(new[] { Entry(day, "09:00", "17:00") }, out var json, out var error)
            .Should().BeFalse();

        json.Should().BeNull();
        error.Should().Be("day");
    }

    [Theory]
    [InlineData("9:00", "17:00")]
    [InlineData("09:00", "25:00")]
    [InlineData("09:00", "17:60")]
    [InlineData("", "17:00")]
    public void TryNormalize_InvalidTime_ReturnsTimeError(string opens, string closes)
    {
        OpeningHoursSerializer.TryNormalize(new[] { Entry("Monday", opens, closes) }, out _, out var error)
            .Should().BeFalse();

        error.Should().Be("time");
    }

    [Theory]
    [InlineData("17:00", "09:00")]
    [InlineData("09:00", "09:00")]
    public void TryNormalize_RangeThatDoesNotAdvance_ReturnsRangeError(string opens, string closes)
    {
        OpeningHoursSerializer.TryNormalize(new[] { Entry("Monday", opens, closes) }, out _, out var error)
            .Should().BeFalse();

        error.Should().Be("range");
    }

    [Fact]
    public void TryNormalize_MoreThanTwoRangesOnTheSameDay_ReturnsDayCountError()
    {
        var entries = new[]
        {
            Entry("Monday", "08:00", "09:00"),
            Entry("Monday", "10:00", "11:00"),
            Entry("Monday", "12:00", "13:00"),
        };

        OpeningHoursSerializer.TryNormalize(entries, out _, out var error).Should().BeFalse();

        error.Should().Be("day-count");
    }

    [Fact]
    public void Parse_MalformedJson_ReturnsEmpty()
    {
        OpeningHoursSerializer.Parse("{not json").Should().BeEmpty();
    }

    [Fact]
    public void Parse_ValidJsonWithInvalidDay_ReturnsEmpty()
    {
        OpeningHoursSerializer.Parse("[{\"day\":\"Lunes\",\"opens\":\"09:00\",\"closes\":\"17:00\"}]")
            .Should().BeEmpty();
    }

    [Fact]
    public void Parse_RoundTripsTheNormalizedJson()
    {
        OpeningHoursSerializer.TryNormalize(
            new[] { Entry("Tuesday", "10:00", "18:00") },
            out var json,
            out _).Should().BeTrue();

        var parsed = OpeningHoursSerializer.Parse(json);

        parsed.Should().ContainSingle().Which.Should().Be(new OpeningHoursEntry("Tuesday", "10:00", "18:00"));
    }

    [Fact]
    public void Parse_NullOrBlank_ReturnsEmpty()
    {
        OpeningHoursSerializer.Parse(null).Should().BeEmpty();
        OpeningHoursSerializer.Parse("   ").Should().BeEmpty();
    }
}
