using Application.Features.WebCatalog.Public;
using FluentAssertions;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T1 de la feature public-catalog-static-pages (S1): el builder puro que mete los metadatos en el
/// &lt;head&gt; del shell del SPA para que Google y las redes (sin ejecutar JS) los vean.
/// </summary>
public class CatalogStaticPageBuilderTests
{
    private const string Shell =
        "<!DOCTYPE html><html lang=\"es\"><head><meta charSet=\"utf-8\"/>" +
        "<link rel=\"icon\" href=\"/favicon.png\"/></head><body><div id=\"app\"></div></body></html>";

    private static CatalogStaticPageMeta Meta(
        string title = "Mercado 25 y 28",
        string? description = "Mira el catálogo de Mercado 25 y 28 y haz tu pedido por WhatsApp.",
        string? image = "https://pos.playground.sceiba.net/media/logo.webp")
        => new(
            Title: title,
            Description: description,
            CanonicalUrl: "https://pos.playground.sceiba.net/catalog/mercado-25-y-28",
            SiteName: "Mercado 25 y 28",
            Locale: "es_ES",
            ImageUrl: image);

    [Fact]
    public void Build_inserts_head_metadata_and_leaves_the_body_untouched()
    {
        var html = CatalogStaticPageBuilder.Build(Shell, Meta());

        // Los metadatos quedan ANTES de </head>, dentro del head.
        html.Should().Contain("<title>Mercado 25 y 28</title>");
        html.Should().Contain("<meta name=\"description\" content=\"Mira el catálogo de Mercado 25 y 28 y haz tu pedido por WhatsApp.\" />");
        html.Should().Contain("<link rel=\"canonical\" href=\"https://pos.playground.sceiba.net/catalog/mercado-25-y-28\" />");
        html.Should().Contain("<meta property=\"og:type\" content=\"website\" />");
        html.Should().Contain("<meta property=\"og:title\" content=\"Mercado 25 y 28\" />");
        html.Should().Contain("<meta property=\"og:url\" content=\"https://pos.playground.sceiba.net/catalog/mercado-25-y-28\" />");
        html.Should().Contain("<meta property=\"og:image\" content=\"https://pos.playground.sceiba.net/media/logo.webp\" />");
        html.Should().Contain("<meta property=\"og:site_name\" content=\"Mercado 25 y 28\" />");
        html.Should().Contain("<meta property=\"og:locale\" content=\"es_ES\" />");
        html.Should().Contain("<meta name=\"twitter:card\" content=\"summary_large_image\" />");

        // Todo se inyectó dentro del <head>: el body no se toca.
        var headEnd = html.IndexOf("</head>", StringComparison.Ordinal);
        html.IndexOf("<title>", StringComparison.Ordinal).Should().BeLessThan(headEnd);
        html.Should().EndWith("<body><div id=\"app\"></div></body></html>");

        // El shell original sigue intacto (iconos y meta ya presentes).
        html.Should().Contain("<meta charSet=\"utf-8\"/>");
        html.Should().Contain("<link rel=\"icon\" href=\"/favicon.png\"/>");
    }

    [Fact]
    public void Build_omits_description_and_image_when_absent()
    {
        var html = CatalogStaticPageBuilder.Build(Shell, Meta(description: null, image: null));

        html.Should().NotContain("name=\"description\"");
        html.Should().NotContain("og:description");
        html.Should().NotContain("og:image");
        html.Should().Contain("<title>Mercado 25 y 28</title>");
        html.Should().Contain("<link rel=\"canonical\"");
    }

    [Fact]
    public void Build_escapes_html_characters_in_title_and_attributes()
    {
        var html = CatalogStaticPageBuilder.Build(
            Shell,
            Meta(title: "Casa \"Pepe\" & Cía <br>", description: "Pizza & pasta <3"));

        // En el TEXTO del <title> las comillas no necesitan escaparse; en los ATRIBUTOS sí.
        html.Should().Contain("<title>Casa \"Pepe\" &amp; Cía &lt;br&gt;</title>");
        html.Should().Contain("content=\"Pizza &amp; pasta &lt;3\"");
        html.Should().Contain("content=\"Casa &quot;Pepe&quot; &amp; Cía &lt;br&gt;\"");
        html.Should().NotContain("<br>");
    }

    [Fact]
    public void Build_replaces_an_existing_title_and_description_instead_of_duplicating()
    {
        const string shellWithPrevious =
            "<!DOCTYPE html><html lang=\"es\"><head><title>Viejo</title>" +
            "<meta name='description' content='vieja'/></head><body></body></html>";

        var html = CatalogStaticPageBuilder.Build(shellWithPrevious, Meta());

        html.Should().NotContain("Viejo");
        html.Should().NotContain("vieja");
        CountOccurrences(html, "<title>").Should().Be(1);
        CountOccurrences(html, "name=\"description\"").Should().Be(1);
    }

    [Fact]
    public void Build_throws_when_the_shell_has_no_head_close()
    {
        var act = () => CatalogStaticPageBuilder.Build("<html><body></body></html>", Meta());

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Build_throws_when_the_shell_is_empty()
    {
        var act = () => CatalogStaticPageBuilder.Build("   ", Meta());

        act.Should().Throw<ArgumentException>();
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        var count = 0;
        var at = haystack.IndexOf(needle, StringComparison.Ordinal);
        while (at >= 0)
        {
            count++;
            at = haystack.IndexOf(needle, at + needle.Length, StringComparison.Ordinal);
        }
        return count;
    }
}
