using Application.Features.WebCatalog.Public;
using Application.Services.Stores;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Options;
using Moq;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T3 de la feature public-catalog-static-pages (S2): la generación toma los datos de la BD
/// (tienda + marca del catálogo) y se los pasa al escritor.
/// </summary>
public sealed class CatalogStaticPageGeneratorTests
{
    private const string BaseUrl = "https://pos.playground.sceiba.net";

    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<ICatalogStaticPageWriter> _writer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly List<(string Slug, CatalogStaticPageMeta Meta)> _written = new();

    public CatalogStaticPageGeneratorTests()
    {
        _writer
            .Setup(w => w.WriteAsync(It.IsAny<string>(), It.IsAny<CatalogStaticPageMeta>(), It.IsAny<CancellationToken>()))
            .Callback<string, CatalogStaticPageMeta, CancellationToken>((slug, meta, _) => _written.Add((slug, meta)))
            .Returns(Task.CompletedTask);
    }

    private CatalogStaticPageGenerator CreateGenerator(string? baseUrl = BaseUrl)
        => new(
            _storeRepository.Object,
            _settingsRepository.Object,
            _writer.Object,
            Options.Create(new CatalogStaticPageOptions { PublicBaseUrl = baseUrl }));

    private Store ArrangeStore(string name = "Mercado 25 y 28", string? description = "Tu mercado de barrio", string? slug = "mercado-25-y-28")
    {
        var store = Store.Create(name, Guid.NewGuid(), approved: true, _tenantId, address: null, description: description);
        store.CatalogSlug = slug;
        _storeRepository.Setup(r => r.GetStoreByIdIgnoreQueryFiltersAsync(_storeId)).ReturnsAsync(store);
        return store;
    }

    private void ArrangeBranding(string? logoKey = null, string? bannerKey = null)
    {
        var settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = logoKey;
        settings.BannerKey = bannerKey;
        _settingsRepository.Setup(r => r.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);
    }

    [Fact]
    public async Task Generate_maps_the_store_and_its_branding_into_the_page_meta()
    {
        ArrangeStore();
        ArrangeBranding(logoKey: "logo.webp", bannerKey: "banner.webp");

        var generated = await CreateGenerator().GenerateAsync(_storeId);

        generated.Should().BeTrue();
        _written.Should().HaveCount(1);
        var (slug, meta) = _written[0];
        slug.Should().Be("mercado-25-y-28");
        meta.Title.Should().Be("Mercado 25 y 28");
        meta.Description.Should().Be("Tu mercado de barrio");
        meta.SiteName.Should().Be("Mercado 25 y 28");
        meta.CanonicalUrl.Should().Be($"{BaseUrl}/catalog/mercado-25-y-28");
        // El logo gana sobre el banner.
        meta.ImageUrl.Should().Be($"{BaseUrl}/api/v1/public/catalog/mercado-25-y-28/media/logo.webp");
    }

    [Fact]
    public async Task Generate_falls_back_to_the_banner_when_there_is_no_logo()
    {
        ArrangeStore();
        ArrangeBranding(logoKey: null, bannerKey: "banner.webp");

        await CreateGenerator().GenerateAsync(_storeId);

        _written[0].Meta.ImageUrl.Should().Be($"{BaseUrl}/api/v1/public/catalog/mercado-25-y-28/media/banner.webp");
    }

    [Fact]
    public async Task Generate_omits_the_image_when_the_store_has_no_branding()
    {
        ArrangeStore();
        _settingsRepository.Setup(r => r.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await CreateGenerator().GenerateAsync(_storeId);

        _written[0].Meta.ImageUrl.Should().BeNull();
    }

    [Fact]
    public async Task Generate_maps_the_public_location_and_opening_hours_into_the_page_meta()
    {
        var store = ArrangeStore();
        store.Address = "Calle 23 #45";
        store.PublicPhone = "+53 5555 1234";
        store.AddressCity = "La Habana";
        store.AddressProvince = "Plaza";
        store.Latitude = 23.13;
        store.Longitude = -82.38;
        store.OpeningHoursJson =
            "[{\"day\":\"Monday\",\"opens\":\"09:00\",\"closes\":\"17:00\"}]";

        await CreateGenerator().GenerateAsync(_storeId);

        var location = _written[0].Meta.Location;
        location.Should().NotBeNull();
        location!.Phone.Should().Be("+53 5555 1234");
        location.StreetAddress.Should().Be("Calle 23 #45");
        location.City.Should().Be("La Habana");
        location.Province.Should().Be("Plaza");
        location.Latitude.Should().Be(23.13);
        location.Longitude.Should().Be(-82.38);
        location.OpeningHours.Should().ContainSingle()
            .Which.Should().Be(new OpeningHoursEntry("Monday", "09:00", "17:00"));
    }

    [Fact]
    public async Task Generate_ignores_a_corrupted_opening_hours_value()
    {
        var store = ArrangeStore();
        store.OpeningHoursJson = "{not json";

        await CreateGenerator().GenerateAsync(_storeId);

        _written[0].Meta.Location!.OpeningHours.Should().BeEmpty();
    }

    [Fact]
    public async Task Generate_trims_a_trailing_slash_in_the_base_url()
    {
        ArrangeStore();

        await CreateGenerator("https://pos.playground.sceiba.net/").GenerateAsync(_storeId);

        _written[0].Meta.CanonicalUrl.Should().Be($"{BaseUrl}/catalog/mercado-25-y-28");
    }

    [Fact]
    public async Task Generate_does_nothing_when_the_store_has_no_catalog_slug()
    {
        ArrangeStore(slug: null);

        var generated = await CreateGenerator().GenerateAsync(_storeId);

        generated.Should().BeFalse();
        _written.Should().BeEmpty();
    }

    [Fact]
    public async Task Generate_does_nothing_when_the_store_does_not_exist()
    {
        _storeRepository.Setup(r => r.GetStoreByIdIgnoreQueryFiltersAsync(_storeId)).ReturnsAsync((Store?)null);

        var generated = await CreateGenerator().GenerateAsync(_storeId);

        generated.Should().BeFalse();
        _writer.Verify(
            w => w.WriteAsync(It.IsAny<string>(), It.IsAny<CatalogStaticPageMeta>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Generate_throws_when_the_public_base_url_is_not_configured()
    {
        ArrangeStore();

        var act = async () => await CreateGenerator(baseUrl: "").GenerateAsync(_storeId);

        await act.Should().ThrowAsync<InvalidOperationException>();
        _written.Should().BeEmpty();
    }
}
