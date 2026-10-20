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
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, new[] { "mercado-uno", "mercado-dos" });

        xml.Should().StartWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        xml.Should().Contain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/catalog/mercado-uno</loc></url>");
        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/catalog/mercado-dos</loc></url>");
        xml.Should().EndWith("</urlset>\n");
    }

    [Fact]
    public void Sitemap_is_deterministic_regardless_of_the_order_of_the_slugs()
    {
        var uno = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, new[] { "zeta", "alfa" });
        var dos = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, new[] { "alfa", "zeta" });

        uno.Should().Be(dos);
    }

    [Fact]
    public void Sitemap_lists_the_landing_first_so_the_product_page_is_discoverable()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, new[] { "mercado-uno" });

        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/</loc></url>");
        xml.IndexOf("<loc>https://vdt.playground.sceiba.net/</loc>", StringComparison.Ordinal)
            .Should().BeLessThan(
                xml.IndexOf("<loc>https://vdt.playground.sceiba.net/catalog/mercado-uno</loc>", StringComparison.Ordinal));
    }

    [Fact]
    public void Sitemap_without_published_catalogs_still_lists_the_landing()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(Base, Array.Empty<string>());

        xml.Should().Contain("<urlset");
        xml.Should().Contain("<url><loc>https://vdt.playground.sceiba.net/</loc></url>");
        xml.Should().NotContain("/catalog/");
        xml.Should().EndWith("</urlset>\n");
    }

    [Fact]
    public void Sitemap_ignores_a_trailing_slash_in_the_base_url()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap(Base + "/", new[] { "mercado-uno" });

        xml.Should().Contain("<loc>https://vdt.playground.sceiba.net/catalog/mercado-uno</loc>");
        xml.Should().NotContain("//catalog/");
    }

    [Fact]
    public void Sitemap_escapes_xml_metacharacters_of_the_base_url()
    {
        var xml = CatalogStaticPageSitemapBuilder.BuildSitemap("https://ejemplo.test/?a=1&b=2", new[] { "mercado-uno" });

        xml.Should().Contain("&amp;b=2");
        xml.Should().NotContain("&b=2");
    }

    [Fact]
    public void Sitemap_requires_a_public_base_url()
    {
        var act = () => CatalogStaticPageSitemapBuilder.BuildSitemap("   ", new[] { "mercado-uno" });

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Robots_allows_crawling_and_references_the_sitemap()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base);

        robots.Should().StartWith("User-agent: *\nAllow: /\n");
        robots.Should().EndWith("Sitemap: https://vdt.playground.sceiba.net/sitemap.xml\n");
    }

    [Fact]
    public void Robots_keeps_the_private_app_routes_out_of_the_index()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base);

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
    public void Robots_ignores_a_trailing_slash_in_the_base_url()
    {
        var robots = CatalogStaticPageSitemapBuilder.BuildRobots(Base + "/");

        robots.Should().Contain("Sitemap: https://vdt.playground.sceiba.net/sitemap.xml\n");
    }

    [Fact]
    public void Robots_requires_a_public_base_url()
    {
        var act = () => CatalogStaticPageSitemapBuilder.BuildRobots("");

        act.Should().Throw<ArgumentException>();
    }
}
