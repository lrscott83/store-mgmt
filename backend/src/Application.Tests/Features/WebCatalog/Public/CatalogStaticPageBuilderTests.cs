using System.Text.Json;
using Application.Features.WebCatalog.Public;
using Application.Services.Stores;
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
        string? image = "https://pos.playground.sceiba.net/media/logo.webp",
        CatalogStaticPageLocation? location = null,
        IReadOnlyList<CatalogStaticPageItem>? items = null)
        => new(
            Title: title,
            Description: description,
            CanonicalUrl: "https://pos.playground.sceiba.net/catalog/mercado-25-y-28",
            SiteName: "Mercado 25 y 28",
            Locale: "es_ES",
            ImageUrl: image,
            Location: location,
            Items: items);

    private static CatalogStaticPageLocation Location(
        string? phone = "+53 5555 1234",
        string? street = "Calle 23 #45, entre 10 y 12",
        string? city = "La Habana",
        string? province = "Plaza",
        double? latitude = 23.13,
        double? longitude = -82.38,
        IReadOnlyList<OpeningHoursEntry>? hours = null)
        => new(
            Phone: phone,
            StreetAddress: street,
            City: city,
            Province: province,
            Latitude: latitude,
            Longitude: longitude,
            OpeningHours: hours ?? new[] { new OpeningHoursEntry("Monday", "09:00", "17:00") });

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

    [Fact]
    public void Build_emits_local_business_json_ld_with_the_core_fields()
    {
        var ld = JsonLd(CatalogStaticPageBuilder.Build(Shell, Meta()));

        ld.GetProperty("@context").GetString().Should().Be("https://schema.org");
        ld.GetProperty("@type").GetString().Should().Be("LocalBusiness");
        ld.GetProperty("name").GetString().Should().Be("Mercado 25 y 28");
        ld.GetProperty("url").GetString().Should()
            .Be("https://pos.playground.sceiba.net/catalog/mercado-25-y-28");
        ld.GetProperty("description").GetString().Should().Contain("catálogo");
        ld.GetProperty("image").GetString().Should()
            .Be("https://pos.playground.sceiba.net/media/logo.webp");
    }

    [Fact]
    public void Build_emits_the_location_as_schema_org_address_geo_and_opening_hours()
    {
        var ld = JsonLd(CatalogStaticPageBuilder.Build(Shell, Meta(location: Location())));

        ld.GetProperty("telephone").GetString().Should().Be("+53 5555 1234");

        var address = ld.GetProperty("address");
        address.GetProperty("@type").GetString().Should().Be("PostalAddress");
        address.GetProperty("streetAddress").GetString().Should().Be("Calle 23 #45, entre 10 y 12");
        address.GetProperty("addressLocality").GetString().Should().Be("La Habana");
        address.GetProperty("addressRegion").GetString().Should().Be("Plaza");
        address.GetProperty("addressCountry").GetString().Should().Be("CU");

        var geo = ld.GetProperty("geo");
        geo.GetProperty("@type").GetString().Should().Be("GeoCoordinates");
        geo.GetProperty("latitude").GetDouble().Should().Be(23.13);
        geo.GetProperty("longitude").GetDouble().Should().Be(-82.38);

        var hours = ld.GetProperty("openingHoursSpecification");
        hours.GetArrayLength().Should().Be(1);
        hours[0].GetProperty("@type").GetString().Should().Be("OpeningHoursSpecification");
        hours[0].GetProperty("dayOfWeek").GetString().Should().Be("Monday");
        hours[0].GetProperty("opens").GetString().Should().Be("09:00");
        hours[0].GetProperty("closes").GetString().Should().Be("17:00");
    }

    [Fact]
    public void Build_omits_location_fields_that_are_absent()
    {
        var ld = JsonLd(CatalogStaticPageBuilder.Build(
            Shell,
            Meta(location: new CatalogStaticPageLocation(
                Phone: null,
                StreetAddress: null,
                City: null,
                Province: null,
                Latitude: null,
                Longitude: null,
                OpeningHours: Array.Empty<OpeningHoursEntry>()))));

        ld.TryGetProperty("telephone", out _).Should().BeFalse();
        ld.TryGetProperty("address", out _).Should().BeFalse();
        ld.TryGetProperty("geo", out _).Should().BeFalse();
        ld.TryGetProperty("openingHoursSpecification", out _).Should().BeFalse();
        ld.GetProperty("name").GetString().Should().Be("Mercado 25 y 28");
    }

    [Fact]
    public void Build_keeps_the_json_ld_inside_its_script_tag_even_with_hostile_values()
    {
        const string hostile = "</script><script>alert(1)</script>";

        var html = CatalogStaticPageBuilder.Build(
            Shell,
            Meta(
                title: hostile,
                description: hostile,
                location: Location(phone: hostile, street: hostile, city: hostile, province: hostile)));

        // Un valor con "</script>" no puede cerrar el bloque: el JSON lo escapa.
        html.Should().NotContain("</script><script>alert(1)</script>");
        CountOccurrences(html, "application/ld+json").Should().Be(1);

        var ld = JsonLd(html);
        ld.GetProperty("name").GetString().Should().Be(hostile);
        ld.GetProperty("description").GetString().Should().Be(hostile);
        ld.GetProperty("telephone").GetString().Should().Be(hostile);
    }

    [Fact]
    public void Build_emits_item_list_json_ld_with_the_effective_price()
    {
        var html = CatalogStaticPageBuilder.Build(Shell, Meta(items: new[]
        {
            new CatalogStaticPageItem(
                "Mujer y hombres primavera #1 y #2", 250.00m, "USD",
                "https://pos.playground.sceiba.net/api/v1/public/catalog/mercado-25-y-28/media/p1.webp"),
            new CatalogStaticPageItem("Camisa", 199.99m, "CUP"),
        }));

        var blocks = JsonLdBlocks(html);
        blocks.Should().HaveCount(2, "LocalBusiness + ItemList");

        var list = blocks[1];
        list.GetProperty("@type").GetString().Should().Be("ItemList");
        var elements = list.GetProperty("itemListElement");
        elements.GetArrayLength().Should().Be(2);

        var first = elements[0];
        first.GetProperty("@type").GetString().Should().Be("ListItem");
        first.GetProperty("position").GetInt32().Should().Be(1);

        var product = first.GetProperty("item");
        product.GetProperty("@type").GetString().Should().Be("Product");
        product.GetProperty("name").GetString().Should().Be("Mujer y hombres primavera #1 y #2");
        product.GetProperty("image").GetString().Should().Contain("/media/p1.webp");

        var offer = product.GetProperty("offers");
        offer.GetProperty("price").GetDecimal().Should().Be(250.00m);
        offer.GetProperty("priceCurrency").GetString().Should().Be("USD");
        offer.GetProperty("availability").GetString().Should().Be("https://schema.org/InStock");

        // Sin imagen, la clave no se emite.
        elements[1].GetProperty("item").TryGetProperty("image", out _).Should().BeFalse();
        elements[1].GetProperty("item").GetProperty("offers").GetProperty("priceCurrency")
            .GetString().Should().Be("CUP");
    }

    [Fact]
    public void Build_omits_the_item_list_when_there_are_no_items()
    {
        var html = CatalogStaticPageBuilder.Build(Shell, Meta(items: Array.Empty<CatalogStaticPageItem>()));

        CountOccurrences(html, "application/ld+json").Should().Be(1);
        html.Should().NotContain("ItemList");
    }

    [Fact]
    public void Build_trims_surrounding_spaces_from_title_and_site_name()
    {
        var html = CatalogStaticPageBuilder.Build(Shell, Meta(title: "  Pacas Gamez  "));

        html.Should().Contain("<title>Pacas Gamez</title>");
        html.Should().Contain("property=\"og:site_name\" content=\"Mercado 25 y 28\"");
        html.Should().NotContain("<title>  Pacas Gamez  </title>");
    }

    [Fact]
    public void Build_emits_twitter_image_and_falls_back_to_summary_without_image()
    {
        var withImage = CatalogStaticPageBuilder.Build(Shell, Meta());
        withImage.Should().Contain("<meta name=\"twitter:card\" content=\"summary_large_image\" />");
        withImage.Should().Contain(
            "<meta name=\"twitter:image\" content=\"https://pos.playground.sceiba.net/media/logo.webp\" />");

        var withoutImage = CatalogStaticPageBuilder.Build(Shell, Meta(image: null));
        withoutImage.Should().Contain("<meta name=\"twitter:card\" content=\"summary\" />");
        withoutImage.Should().NotContain("twitter:image");
        withoutImage.Should().NotContain("summary_large_image");
    }

    [Fact]
    public void Build_cannot_be_closed_by_a_hostile_product_name()
    {
        const string hostile = "</script><script>alert(1)</script>";

        var html = CatalogStaticPageBuilder.Build(
            Shell,
            Meta(items: new[] { new CatalogStaticPageItem(hostile, 10m, "USD") }));

        html.Should().NotContain("</script><script>alert(1)</script>");
        CountOccurrences(html, "application/ld+json").Should().Be(2);

        var list = JsonLdBlocks(html)[1];
        list.GetProperty("itemListElement")[0].GetProperty("item").GetProperty("name")
            .GetString().Should().Be(hostile);
    }

    private static IReadOnlyList<JsonElement> JsonLdBlocks(string html)
    {
        const string open = "<script type=\"application/ld+json\">";
        var blocks = new List<JsonElement>();
        var at = html.IndexOf(open, StringComparison.Ordinal);
        while (at >= 0)
        {
            var end = html.IndexOf("</script>", at, StringComparison.Ordinal);
            end.Should().BeGreaterThan(at);
            var json = html.Substring(at + open.Length, end - at - open.Length);
            using var document = JsonDocument.Parse(json);
            blocks.Add(document.RootElement.Clone());
            at = html.IndexOf(open, end, StringComparison.Ordinal);
        }
        return blocks;
    }

    private static JsonElement JsonLd(string html)
    {
        const string open = "<script type=\"application/ld+json\">";
        var start = html.IndexOf(open, StringComparison.Ordinal);
        start.Should().BeGreaterThan(-1, "the page must carry one JSON-LD block");
        var end = html.IndexOf("</script>", start, StringComparison.Ordinal);
        end.Should().BeGreaterThan(start);
        var json = html.Substring(start + open.Length, end - start - open.Length);

        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
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
