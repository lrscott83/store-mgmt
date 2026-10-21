using System.Net;
using Domain.Entities.StoreCatalogSettings;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// El PUT parcial de marca (`PUT /api/v1/catalog/branding`) se probaba SOLO en la capa Application:
/// el comando se construía a mano y nunca pasaba por el binding multipart de MVC. Estos tests
/// recorren la petición HTTP real, que es la única forma de ver si `removeLogo` y `mobileColumns`
/// llegan al comando desde un formulario sin archivos.
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogBrandingTests
{
    private readonly AppTestFactory _f;

    public WebCatalogBrandingTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private async Task SeedBrandingAsync(WebCatalogSeed.StoreFixture fixture, string? logoKey, int mobileColumns)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var settings = StoreCatalogSettings.Create(fixture.StoreId, fixture.TenantId);
        settings.LogoKey = logoKey;
        settings.MobileColumns = mobileColumns;
        db.Set<StoreCatalogSettings>().Add(settings);
        await db.SaveChangesAsync();
    }

    private async Task<StoreCatalogSettings> ReadBrandingAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreCatalogSettings>().IgnoreQueryFilters().AsNoTracking()
            .SingleAsync(settings => settings.StoreId == storeId);
    }

    private async Task CleanupAsync(WebCatalogSeed.StoreFixture fixture)
    {
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
                .Where(settings => settings.StoreId == fixture.StoreId)
                .ExecuteDeleteAsync();
        }

        await WebCatalogSeed.CleanupAsync(_f, fixture);
    }

    private static MultipartFormDataContent BrandForm(params (string Name, string Value)[] fields)
    {
        var content = new MultipartFormDataContent();
        foreach (var (name, value) in fields)
            content.Add(new StringContent(value), name);
        return content;
    }

    [Fact]
    public async Task Removing_the_logo_with_only_the_remove_flag_clears_the_key()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SeedBrandingAsync(fixture, "brand/logo-old.png", 2);

            using var content = BrandForm(("removeLogo", "true"));
            var response = await ClientFor(fixture).PutAsync("/api/v1/catalog/branding", content);

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "quitar el logo es una instrucción completa: {0}", await response.Content.ReadAsStringAsync());
            (await ReadBrandingAsync(fixture.StoreId)).LogoKey.Should().BeNull();
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Changing_mobile_columns_with_only_that_field_persists_it()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SeedBrandingAsync(fixture, null, 2);

            using var content = BrandForm(("mobileColumns", "1"));
            var response = await ClientFor(fixture).PutAsync("/api/v1/catalog/branding", content);

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "elegir 1 elemento por fila es una instrucción completa: {0}", await response.Content.ReadAsStringAsync());
            (await ReadBrandingAsync(fixture.StoreId)).MobileColumns.Should().Be(1);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }
}
