using Application.Features.WebCatalog.Public;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T4 de la feature public-catalog-static-pages: el regenerador es BEST-EFFORT — un fallo al generar
/// la página nunca debe tumbar la operación que lo disparó.
/// </summary>
public sealed class CatalogStaticPageRegeneratorTests
{
    private readonly Mock<ICatalogStaticPageGenerator> _generator = new();
    private readonly CatalogStaticPageRegenerator _regenerator;

    public CatalogStaticPageRegeneratorTests()
        => _regenerator = new CatalogStaticPageRegenerator(
            _generator.Object,
            NullLogger<CatalogStaticPageRegenerator>.Instance);

    [Fact]
    public async Task Regenerate_calls_the_generator_for_the_store()
    {
        var storeId = Guid.NewGuid();

        await _regenerator.RegenerateAsync(storeId);

        _generator.Verify(g => g.GenerateAsync(storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Regenerate_swallows_a_generator_failure()
    {
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new FileNotFoundException("missing shell"));

        var act = async () => await _regenerator.RegenerateAsync(Guid.NewGuid());

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task Regenerate_swallows_cancellation()
    {
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());

        var act = async () => await _regenerator.RegenerateAsync(Guid.NewGuid());

        await act.Should().NotThrowAsync();
    }
}
