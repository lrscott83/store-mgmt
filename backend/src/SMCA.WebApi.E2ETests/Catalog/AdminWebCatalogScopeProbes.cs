using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Regresiones del alcance de tienda del catálogo admin (verificación independiente, 2026-10-23):
/// cubren lo que <see cref="AdminWebCatalogTests"/> no probaba —los 13 endpoints con un Owner, las
/// escrituras cruzadas entre tiendas, la prioridad ruta/claim y los límites de id—. Sin estos
/// probes, un futuro cambio en el filtro podría abrir un endpoint o una escritura cross-store sin
/// que ninguna prueba se entere.
/// </summary>
[Collection("e2e")]
public sealed class AdminWebCatalogScopeProbes
{
    private readonly AppTestFactory _f;

    public AdminWebCatalogScopeProbes(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record StatusDto(string StoreSlug, int SourceProductsCount);
    private sealed record ProductDto(Guid Id, string Name, string Description);
    private sealed record BrandingDto(string? LogoKey, int MobileColumns);

    private static async Task SeedPublishedProductAsync(AppTestFactory factory,
        WebCatalogSeed.StoreFixture store, string categoryName, string productName)
    {
        var category = await WebCatalogSeed.AddCategoryAsync(factory, store, categoryName);
        await WebCatalogSeed.AddProductAsync(factory, store, category.Id, productName, 2.5m);
        (await DbTestHelpers.AuthedClient(factory, store.UserId, store.Login)
            .PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();
    }

    /// <summary>
    /// S3: un no-SuperAdmin recibe 403 en los 13 endpoints, incluso poniendo en la ruta el id de
    /// OTRA tienda. Sin esto solo se probaban tres GET.
    /// </summary>
    [Fact]
    public async Task Owner_gets_403_on_all_13_admin_endpoints_for_another_store()
    {
        var ownerStore = await WebCatalogSeed.SeedOwnerAsync(_f);
        var other = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, ownerStore.UserId, ownerStore.Login);
            Guid store = other.StoreId;
            Guid product = Guid.NewGuid();
            var checks = new (string Label, Func<Task<HttpResponseMessage>> Call)[]
            {
                ("POST sync", () => client.PostAsJsonAsync($"/api/v1/stores/{store}/catalog/sync", new { })),
                ("GET status", () => client.GetAsync($"/api/v1/stores/{store}/catalog/status")),
                ("GET products", () => client.GetAsync($"/api/v1/stores/{store}/catalog/products")),
                ("PUT product", () => client.PutAsJsonAsync($"/api/v1/stores/{store}/catalog/products/{product}", new { description = "x" })),
                ("POST image", () => client.PostAsync($"/api/v1/stores/{store}/catalog/products/{product}/images", new MultipartFormDataContent())),
                ("DELETE image", () => client.DeleteAsync($"/api/v1/stores/{store}/catalog/products/{product}/images?path=x")),
                ("PUT image order", () => client.PutAsJsonAsync($"/api/v1/stores/{store}/catalog/products/{product}/images/order", new { paths = new[] { "a" } })),
                ("GET branding", () => client.GetAsync($"/api/v1/stores/{store}/catalog/branding")),
                ("PUT branding", () => client.PutAsync($"/api/v1/stores/{store}/catalog/branding", new MultipartFormDataContent())),
                ("GET showcase", () => client.GetAsync($"/api/v1/stores/{store}/catalog/showcase")),
                ("POST showcase", () => client.PostAsync($"/api/v1/stores/{store}/catalog/showcase", new MultipartFormDataContent())),
                ("DELETE showcase", () => client.DeleteAsync($"/api/v1/stores/{store}/catalog/showcase/{Guid.NewGuid()}")),
                ("PUT showcase order", () => client.PutAsJsonAsync($"/api/v1/stores/{store}/catalog/showcase/order", new { kind = 0, orderedIds = Array.Empty<string>() })),
            };

            var failures = new List<string>();
            foreach (var (label, call) in checks)
            {
                var response = await call();
                if (response.StatusCode != HttpStatusCode.Forbidden)
                    failures.Add($"{label} -> {(int)response.StatusCode}");
            }

            failures.Should().BeEmpty();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, ownerStore);
            await WebCatalogSeed.CleanupAsync(_f, other);
        }
    }

    /// <summary>
    /// S3/S4: las escrituras van a la tienda de la RUTA y un id de otra tienda responde 404 sin
    /// tocarla. La marca se escribe en A y B conserva la suya.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_writes_go_to_the_route_store_and_cannot_cross_over()
    {
        var a = await WebCatalogSeed.SeedOwnerAsync(_f);
        var b = await WebCatalogSeed.SeedOwnerAsync(_f);
        var saLogin = $"sa-probe-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            var categoryB = await WebCatalogSeed.AddCategoryAsync(_f, b, "Cat B");
            var productB = await WebCatalogSeed.AddProductAsync(_f, b, categoryB.Id, "Producto B", 3m);
            var sa = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            var form = new MultipartFormDataContent { { new StringContent("1"), "mobileColumns" } };
            (await sa.PutAsync($"/api/v1/stores/{a.StoreId}/catalog/branding", form)).StatusCode
                .Should().Be(HttpStatusCode.OK);

            var brandA = await sa.GetFromJsonAsync<ApiResponse<BrandingDto>>(
                $"/api/v1/stores/{a.StoreId}/catalog/branding", ApiResponse.Json);
            brandA!.Data!.MobileColumns.Should().Be(1);

            var brandB = await sa.GetFromJsonAsync<ApiResponse<BrandingDto>>(
                $"/api/v1/stores/{b.StoreId}/catalog/branding", ApiResponse.Json);
            brandB!.Data!.MobileColumns.Should().Be(2, "la tienda B no se toca");

            var cross = await sa.PutAsJsonAsync($"/api/v1/stores/{a.StoreId}/catalog/products/{productB.Id}",
                new { description = "cross-store-write" });
            cross.StatusCode.Should().Be(HttpStatusCode.NotFound);

            var productsB = await sa.GetFromJsonAsync<ApiResponse<List<ProductDto>>>(
                $"/api/v1/stores/{b.StoreId}/catalog/products", ApiResponse.Json);
            productsB!.Data!.Single(x => x.Id == productB.Id).Description.Should().NotBe("cross-store-write");

            (await sa.DeleteAsync($"/api/v1/stores/{a.StoreId}/catalog/showcase/{Guid.NewGuid()}")).StatusCode
                .Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            // WebCatalogSeed.CleanupAsync no borra StoreCatalogSettings (FK 23503 si se escribió
            // la marca): se limpia antes solo para estas dos tiendas.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<Domain.Entities.StoreCatalogSettings.StoreCatalogSettings>().IgnoreQueryFilters()
                    .Where(settings => settings.StoreId == a.StoreId || settings.StoreId == b.StoreId)
                    .ExecuteDeleteAsync();
            }

            await WebCatalogSeed.CleanupAsync(_f, a);
            await WebCatalogSeed.CleanupAsync(_f, b);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>
    /// S4: con una tienda seleccionada, el SuperAdmin sigue viendo ESA en las rutas del dueño; la
    /// ruta admin lee la suya y no deja rastro en el claim.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_with_a_selected_store_keeps_the_claim_on_owner_routes()
    {
        var a = await WebCatalogSeed.SeedOwnerAsync(_f);
        var b = await WebCatalogSeed.SeedOwnerAsync(_f);
        var saLogin = $"sa-probe-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            await SeedPublishedProductAsync(_f, a, "Cat A", "Producto A");
            await SeedPublishedProductAsync(_f, b, "Cat B", "Producto B");

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters()
                    .FirstAsync(candidate => candidate.Id == saId);
                user.SelectedStoreId = a.StoreId;
                db.Set<Domain.Entities.Users.User>().Update(user);
                await db.SaveChangesAsync();
            }

            var sa = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            (await sa.GetFromJsonAsync<ApiResponse<StatusDto>>("/api/v1/catalog/status", ApiResponse.Json))!
                .Data!.StoreSlug.Should().Be(a.Slug);
            (await sa.GetFromJsonAsync<ApiResponse<StatusDto>>(
                $"/api/v1/stores/{b.StoreId}/catalog/status", ApiResponse.Json))!.Data!.StoreSlug.Should().Be(b.Slug);
            (await sa.GetFromJsonAsync<ApiResponse<StatusDto>>("/api/v1/catalog/status", ApiResponse.Json))!
                .Data!.StoreSlug.Should().Be(a.Slug);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, a);
            await WebCatalogSeed.CleanupAsync(_f, b);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>S7: el sync admin publica el origen del servidor, sin snapshot del dispositivo.</summary>
    [Fact]
    public async Task SuperAdmin_sync_without_snapshot_publishes_the_server_origin()
    {
        var a = await WebCatalogSeed.SeedOwnerAsync(_f);
        var b = await WebCatalogSeed.SeedOwnerAsync(_f);
        var saLogin = $"sa-probe-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, a, "Cat A");
            await WebCatalogSeed.AddProductAsync(_f, a, category.Id, "Producto A", 1m);
            var sa = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            var response = await sa.PostAsJsonAsync($"/api/v1/stores/{a.StoreId}/catalog/sync", new { });
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<SyncSummaryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.StoreSlug.Should().Be(a.Slug);

            (await sa.GetFromJsonAsync<ApiResponse<StatusDto>>(
                $"/api/v1/stores/{a.StoreId}/catalog/status", ApiResponse.Json))!.Data!.SourceProductsCount.Should().Be(1);
            (await sa.GetFromJsonAsync<ApiResponse<StatusDto>>(
                $"/api/v1/stores/{b.StoreId}/catalog/status", ApiResponse.Json))!.Data!.SourceProductsCount.Should().Be(0);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, a);
            await WebCatalogSeed.CleanupAsync(_f, b);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>Un id desconocido o mal formado es 404; uno válido, 200.</summary>
    [Fact]
    public async Task Unknown_and_malformed_store_ids_are_404()
    {
        var a = await WebCatalogSeed.SeedOwnerAsync(_f);
        var saLogin = $"sa-probe-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            (await sa.GetAsync($"/api/v1/stores/{Guid.NewGuid()}/catalog/status")).StatusCode
                .Should().Be(HttpStatusCode.NotFound);
            (await sa.GetAsync("/api/v1/stores/not-a-guid/catalog/status")).StatusCode
                .Should().Be(HttpStatusCode.NotFound);
            (await sa.GetAsync($"/api/v1/stores/{a.StoreId}/catalog/status")).StatusCode
                .Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, a);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }
}
