using Application.Features.WebCatalog.Public;
using FluentAssertions;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T6 de la feature public-catalog-static-pages: el intervalo del sincronizador es configurable,
/// pero con un mínimo duro — un valor mal puesto a mano (0, negativo) no puede convertirse en un
/// bucle que martille el disco.
/// </summary>
public sealed class CatalogStaticPageOptionsTests
{
    [Fact]
    public void Synchronization_interval_defaults_to_thirty_seconds()
    {
        var options = new CatalogStaticPageOptions();

        options.SynchronizationIntervalSeconds.Should().Be(30);
        options.SynchronizationInterval.Should().Be(TimeSpan.FromSeconds(30));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(4)]
    public void Synchronization_interval_clamps_tiny_values_to_five_seconds(int configured)
    {
        var options = new CatalogStaticPageOptions { SynchronizationIntervalSeconds = configured };

        options.SynchronizationInterval.Should().Be(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Synchronization_interval_respects_a_valid_value()
    {
        var options = new CatalogStaticPageOptions { SynchronizationIntervalSeconds = 120 };

        options.SynchronizationInterval.Should().Be(TimeSpan.FromSeconds(120));
    }
}
