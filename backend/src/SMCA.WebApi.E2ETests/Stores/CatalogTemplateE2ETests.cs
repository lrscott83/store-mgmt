using System.Net;
using System.Net.Http.Json;
using Application.Dtos.StoreManagement;
using Domain.Common.Constants;
using Domain.Entities.StoreCatalogSettings;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// Unidad 9 — `GET`/`PUT /api/v1/stores/{storeId}/catalog-template` (SuperAdmin).
///
/// Lo que estos E2E cubren y los unitarios no pueden: el contrato HTTP completo (ruta, binding del
/// cuerpo, `HasPermission(SuperAdmin)` real, y la fila de `StoreCatalogSettings` en PostgreSQL),
/// más la escritura PARCIAL por columnas que solo se observa contra la base.
///
/// Casos:
///   * Sin fila de configuración la lectura devuelve la plantilla por defecto, no un 404: una tienda
///     recién creada tiene catálogo y todavía no tiene configuración.
///   * La escritura persiste SOLO `TemplateId`: ni los interruptores de pedidos ni la paleta de la
///     fila se tocan (la fila es UNA por tienda, D19).
///   * Un id fuera del contrato kebab-case se rechaza con 400 antes de tocar la base.
///   * Un OwnerAdmin de la tienda NO puede leer ni escribir la plantilla: es decisión de plataforma.
/// </summary>
[Collection("e2e")]
public sealed class CatalogTemplateE2ETests
{
    private readonly AppTestFactory _f;

    public CatalogTemplateE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private static string TemplateUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog-template";

    private async Task<(StoreSeed.StoreFixture Store, Guid SuperAdminId, string SuperAdminLogin)> SeedAsync()
    {
        StoreSeed.StoreFixture store = await StoreSeed.SeedStoreAsync(
            _f, $"E2E Plantilla {Guid.NewGuid():N}", approved: true);

        string login = $"sa-template-{Guid.NewGuid():N}@test.com";
        Guid superAdminId = await AuthTestHelpers.SeedActiveUserAsync(_f, login);
        return (store, superAdminId, login);
    }

    private HttpClient SuperAdminClient(Guid id, string login) => DbTestHelpers.AuthedClient(_f, id, login);

    /// <summary>
    /// Siembra la fila que la escritura NO debe tocar. `Enabled`/`PickupEnabled`/`PaletteId`
    /// distintos de los defaults son la prueba: si el handler escribiera la fila completa, estos
    /// valores se perderían y el test lo vería.
    /// </summary>
    private async Task SeedSettingsRowAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var settings = StoreCatalogSettings.Create(storeId, DataUtils.DefaultTenant.Id);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        settings.PaletteId = "midnight";

        db.Set<StoreCatalogSettings>().Add(settings);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// La fila de configuración tiene FK `Restrict` a `Store`, así que se borra ANTES del grafo de la
    /// tienda. Sin este orden la limpieza falla y contamina la corrida siguiente del fixture.
    /// </summary>
    private async Task CleanupAsync(StoreSeed.StoreFixture store)
    {
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
                .Where(settings => settings.StoreId == store.StoreId)
                .ExecuteDeleteAsync();
        }

        await StoreSeed.CleanupStoreFixtureAsync(_f, store);
    }

    [Fact]
    public async Task Get_without_a_settings_row_returns_the_default_template()
    {
        var (store, superAdminId, superAdminLogin) = await SeedAsync();
        try
        {
            var client = SuperAdminClient(superAdminId, superAdminLogin);

            var response = await client.GetAsync(TemplateUrl(store.StoreId));

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "una tienda sin fila de configuración NO es un 404: la plantilla por defecto existe");

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<StoreCatalogTemplateDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            body.Data!.StoreId.Should().Be(store.StoreId);
            body.Data.TemplateId.Should().Be(StoreCatalogSettings.DefaultTemplateId,
                "sin fila, el storefront tiene que seguir pintando la plantilla de siempre");
            body.Data.CatalogSlug.Should().BeEmpty(
                "la tienda sembrada nunca sincronizó su catálogo, así que no tiene URL pública");

            (await OrderingQueries.ReadSettingsRowAsync(_f, store.StoreId)).Should().BeNull(
                "la lectura no puede crear la fila que no existe");
        }
        finally
        {
            await CleanupAsync(store);
        }
    }

    [Fact]
    public async Task Put_persists_only_the_template_and_get_reads_it_back()
    {
        var (store, superAdminId, superAdminLogin) = await SeedAsync();
        try
        {
            await SeedSettingsRowAsync(store.StoreId);

            var client = SuperAdminClient(superAdminId, superAdminLogin);

            var put = await client.PutAsJsonAsync(
                TemplateUrl(store.StoreId), new { templateId = "boutique" });

            put.StatusCode.Should().Be(HttpStatusCode.OK);
            var putBody = await put.Content
                .ReadFromJsonAsync<ApiResponse<StoreCatalogTemplateDto>>(ApiResponse.Json);
            putBody!.Succeeded.Should().BeTrue();
            putBody.Data!.TemplateId.Should().Be("boutique");

            // La COLUMNA, no solo el DTO que sale del mismo objeto mutado.
            var row = await OrderingQueries.ReadSettingsRowAsync(_f, store.StoreId);
            row.Should().NotBeNull("la fila ya existía y se actualiza en sitio");
            row!.TemplateId.Should().Be("boutique");
            row.Enabled.Should().BeTrue(
                "fijar la plantilla no enciende ni apaga los pedidos: solo cambia la vista");
            row.PickupEnabled.Should().BeTrue("la escritura parcial no toca las modalidades");
            row.PaletteId.Should().Be("midnight",
                "la paleta de la tienda no puede revertirse al escribir la plantilla");

            // Y la lectura pública del editor devuelve lo mismo que se escribió.
            var get = await client.GetAsync(TemplateUrl(store.StoreId));
            get.StatusCode.Should().Be(HttpStatusCode.OK);
            var getBody = await get.Content
                .ReadFromJsonAsync<ApiResponse<StoreCatalogTemplateDto>>(ApiResponse.Json);
            getBody!.Data!.TemplateId.Should().Be("boutique");
        }
        finally
        {
            await CleanupAsync(store);
        }
    }

    [Theory]
    [InlineData("Boutique")]   // mayúsculas: el contrato es kebab-case
    [InlineData("boutiqe!")]   // carácter fuera del alfabeto permitido
    [InlineData("")]           // vacío
    public async Task Put_rejects_a_template_id_outside_the_kebab_case_contract(string templateId)
    {
        var (store, superAdminId, superAdminLogin) = await SeedAsync();
        try
        {
            await SeedSettingsRowAsync(store.StoreId);
            var client = SuperAdminClient(superAdminId, superAdminLogin);

            var response = await client.PutAsJsonAsync(
                TemplateUrl(store.StoreId), new { templateId });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var row = await OrderingQueries.ReadSettingsRowAsync(_f, store.StoreId);
            row!.TemplateId.Should().Be(StoreCatalogSettings.DefaultTemplateId,
                "un id rechazado no puede quedar persistido");
        }
        finally
        {
            await CleanupAsync(store);
        }
    }

    [Fact]
    public async Task Catalog_template_is_forbidden_for_the_owner_of_the_store()
    {
        StoreSeed.StoresAdminFixture owner = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);

            var get = await client.GetAsync(TemplateUrl(owner.StoreId));
            var put = await client.PutAsJsonAsync(
                TemplateUrl(owner.StoreId), new { templateId = "boutique" });

            get.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "la vista del catálogo es una decisión de plataforma, no de la tienda");
            put.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            (await OrderingQueries.ReadSettingsRowAsync(_f, owner.StoreId)).Should().BeNull(
                "la escritura rechazada no puede dejar fila creada");
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, owner);
        }
    }
}
