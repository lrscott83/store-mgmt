using Application.Features.WebCatalog.Public;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T4 de la feature public-catalog-static-pages: el regenerador es BEST-EFFORT — un fallo al generar
/// la página nunca debe tumbar la operación que lo disparó. Y donde la feature no está configurada
/// (dev, tests) se calla: "apagada" no es "rota".
/// </summary>
public sealed class CatalogStaticPageRegeneratorTests
{
    private readonly Mock<ICatalogStaticPageGenerator> _generator = new();
    private readonly CatalogStaticPageRegenerator _regenerator;

    /// <summary>Un entorno donde la pre-generación SÍ está encendida (volumen compartido montado).</summary>
    private static IOptions<CatalogStaticPageOptions> Enabled => Options.Create(
        new CatalogStaticPageOptions
        {
            ShellPath = "/shared/shell/index.html",
            OutputRoot = "/shared",
        });

    public CatalogStaticPageRegeneratorTests()
        => _regenerator = new CatalogStaticPageRegenerator(
            _generator.Object,
            Enabled,
            NullLogger<CatalogStaticPageRegenerator>.Instance);

    [Fact]
    public async Task Regenerate_calls_the_generator_for_the_store()
    {
        var storeId = Guid.NewGuid();

        await _regenerator.RegenerateAsync(storeId);

        _generator.Verify(g => g.GenerateAsync(storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Regenerate_does_nothing_when_the_feature_is_not_configured()
    {
        var regenerator = new CatalogStaticPageRegenerator(
            _generator.Object,
            // A medias a propósito: con UNA sola de las dos rutas la feature no está configurada.
            Options.Create(new CatalogStaticPageOptions { ShellPath = "/shared/shell/index.html" }),
            NullLogger<CatalogStaticPageRegenerator>.Instance);

        await regenerator.RegenerateAsync(Guid.NewGuid());

        _generator.Verify(
            g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
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
