using Application.Features.WebCatalog.Public;
using FluentAssertions;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T7 de la feature public-catalog-static-pages (S5): el sitemap lista TODOS los catálogos publicados
/// —URL absoluta, la misma del canonical de la página— y robots.txt lo referencia. Puro y
/// determinista: el mismo conjunto de slugs produce el mismo archivo.
/// </summary>
public sealed class CatalogStaticPageSitemapBuilderTests
{
    private const string Base = "https://vdt.playground.sceiba.net";

    [Fact]
    public void Sitemap_lists_every_published_slug_with_its_absolute_url()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(
            Base, new[] { "mercado-uno", "mercado-dos" }, allowIndexing: true);

        xml.Should().StartWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        xml.Should().Contain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/catalog/mercado-uno</loc></url>");
        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/catalog/mercado-dos</loc></url>");
        xml.Should().EndWith("</urlset>\n");
    }

    [Fact]
    public void Sitemap_is_deterministic_regardless_of_the_order_of_the_slugs()
    {
        var uno = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, new[] { "zeta", "alfa" }, allowIndexing: true);
        var dos = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, new[] { "alfa", "zeta" }, allowIndexing: true);

        uno.Should().Be(dos);
    }

    [Fact]
    public void Sitemap_lists_the_landing_first_so_the_product_page_is_discoverable()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, new[] { "mercado-uno" }, allowIndexing: true);

        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/</loc></url>");
        xml.IndexOf("<loc>https://vdt.playground.sceiba.net/</loc>", StringComparison.Ordinal)
            .Should().BeLessThan(
                xml.IndexOf("<loc>https://vdt.playground.sceiba.net/catalog/mercado-uno</loc>", StringComparison.Ordinal));
    }

    [Fact]
    public void Sitemap_without_published_catalogs_still_lists_the_landing()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, Array.Empty<string>(), allowIndexing: true);

        xml.Should().Contain("<urlset");
        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/</loc></url>");
        xml.Should().NotContain("/catalog/");
        xml.Should().EndWith("</urlset>\n");
    }

    [Fact]
    public void Sitemap_ignores_a_trailing_slash_in_the_base_url()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(Base + "/", new[] { "mercado-uno" }, allowIndexing: true);

        xml.Should().Contain("<loc>https://vdt.playground.sceiba.net/catalog/mercado-uno</loc>");
        xml.Should().NotContain("//catalog/");
    }

    [Fact]
    public void Sitemap_escapes_xml_metacharacters_of_the_base_url()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(
            "https://ejemplo.test/?a=1&b=2", new[] { "mercado-uno" }, allowIndexing: true);

        xml.Should().Contain("&amp;b=2");
        xml.Should().NotContain("&b=2");
    }

    [Fact]
    public void Sitemap_requires_a_public_base_url()
    {
        var act = () => CatalogStaticPageSitemapBuilder.BuildSitemap(
            "   ", new[] { "mercado-uno" }, allowIndexing: true);

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Sitemap_is_empty_when_the_environment_is_closed_to_crawlers()
    {
        // Un sitemap.xml anterior ya escrito en el volumen deja de anunciar URLs en el siguiente
        // pase: el archivo sigue existiendo (válido y determinista) pero sin ninguna <url>.
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(
            Base, new[] { "mercado-uno", "mercado-dos" }, allowIndexing: false);

        xml.Should().Contain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        xml.Should().NotContain("<url>");
        xml.Should().NotContain("mercado-uno");
        xml.Should().NotContain("https://vdt.playground.sceiba.net/");
        xml.Should().EndWith("</urlset>\n");
    }

    [Fact]
    public void Robots_allows_crawling_and_references_the_sitemap()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base, allowIndexing: true);

        robots.Should().StartWith("User-agent: *\nAllow: /\n");
        robots.Should().EndWith("Sitemap: https://vdt.playground.sceiba.net/sitemap.xml\n");
    }

    [Fact]
    public void Robots_keeps_the_private_app_routes_out_of_the_index()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base, allowIndexing: true);

        // Rutas de la app detrás de login: no son contenido público.
        robots.Should().Contain("Disallow: /login\n");
        robots.Should().Contain("Disallow: /register\n");
        robots.Should().Contain("Disallow: /sales\n");
        robots.Should().Contain("Disallow: /admin\n");
        robots.Should().Contain("Disallow: /management\n");
        robots.Should().Contain("Disallow: /profile\n");
        robots.Should().Contain("Disallow: /diagnostics\n");
        // Lo público sigue permitido.
        robots.Should().NotContain("Disallow: /catalog");
        robots.Should().NotContain("Disallow: /\n");
    }

    [Fact]
    public void Robots_leaves_the_public_legal_pages_crawlable()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base, allowIndexing: true);

        // /private-police es la política de privacidad y /terms-conditions los términos: públicas.
        robots.Should().NotContain("Disallow: /private-police");
        robots.Should().NotContain("Disallow: /terms-conditions");
    }

    [Fact]
    public void Robots_publishes_the_exact_document()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base, allowIndexing: true);

        robots.Should().Be(
            "User-agent: *\n" +
            "Allow: /\n" +
            "Disallow: /admin\n" +
            "Disallow: /auth\n" +
            "Disallow: /diagnostics\n" +
            "Disallow: /expenses\n" +
            "Disallow: /health\n" +
            "Disallow: /help\n" +
            "Disallow: /inventory\n" +
            "Disallow: /login\n" +
            "Disallow: /management\n" +
            "Disallow: /profile\n" +
            "Disallow: /register\n" +
            "Disallow: /reports\n" +
            "Disallow: /sales\n" +
            "Disallow: /stats\n" +
            "Disallow: /sync\n" +
            "\n" +
            "Sitemap: https://vdt.playground.sceiba.net/sitemap.xml\n");
    }

    [Fact]
    public void Robots_ignores_a_trailing_slash_in_the_base_url()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base + "/", allowIndexing: true);

        robots.Should().Contain("Sitemap: https://vdt.playground.sceiba.net/sitemap.xml\n");
    }

    [Fact]
    public void Robots_requires_a_public_base_url()
    {
        var act = () => CatalogStaticPageSitemapBuilder.BuildRobots("", allowIndexing: true);

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Robots_disallows_everything_and_drops_the_sitemap_when_the_environment_is_closed()
    {
        // Entorno de pruebas: fuera de los buscadores por completo. Sin línea Sitemap, para no
        // invitar al rastreador a un urlset que además se publica vacío.
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base, allowIndexing: false);

        robots.Should().Be("User-agent: *\nDisallow: /\n");
        robots.Should().NotContain("Allow: /");
        robots.Should().NotContain("Sitemap:");
    }
}
