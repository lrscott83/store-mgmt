using System.Text;
using Application.Features.WebCatalog.Public;
using FluentAssertions;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T6 de la feature public-catalog-static-pages (S9): la firma del shell es lo que le dice al
/// sincronizador que hay un build nuevo que regenerar. Igual para el mismo contenido (no dispara
/// regeneraciones espurias) y distinta cuando el contenido cambia (un deploy siempre la cambia,
/// porque el shell referencia assets hasheados del build).
/// </summary>
public sealed class CatalogStaticPageShellSignatureTests : IDisposable
{
    private readonly string _root;
    private readonly string _shellPath;

    public CatalogStaticPageShellSignatureTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "catalog-static-page-signature-" + Guid.NewGuid().ToString("N"));
        _shellPath = Path.Combine(_root, "index.html");
        Directory.CreateDirectory(_root);
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch { /* best effort cleanup */ }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Compute_returns_null_without_a_configured_path(string? path)
    {
        CatalogStaticPageShellSignature.Compute(path).Should().BeNull();
    }

    [Fact]
    public void Compute_returns_null_when_the_file_does_not_exist()
    {
        CatalogStaticPageShellSignature.Compute(Path.Combine(_root, "missing.html")).Should().BeNull();
    }

    [Fact]
    public void Compute_is_stable_for_the_same_content()
    {
        File.WriteAllText(_shellPath, "<html>v1</html>", new UTF8Encoding(false));

        var first = CatalogStaticPageShellSignature.Compute(_shellPath);
        var second = CatalogStaticPageShellSignature.Compute(_shellPath);

        first.Should().NotBeNull();
        first.Should().HaveLength(64, "es un SHA-256 en hexadecimal");
        second.Should().Be(first);
    }

    [Fact]
    public void Compute_changes_when_the_content_changes()
    {
        File.WriteAllText(_shellPath, "<html>build-1</html>", new UTF8Encoding(false));
        var beforeDeploy = CatalogStaticPageShellSignature.Compute(_shellPath);

        File.WriteAllText(_shellPath, "<html>build-2</html>", new UTF8Encoding(false));
        var afterDeploy = CatalogStaticPageShellSignature.Compute(_shellPath);

        afterDeploy.Should().NotBeNull().And.NotBe(beforeDeploy);
    }
}
