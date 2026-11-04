using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Application.Abstractions.Authentication;
using Domain.Common.Enums;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// T13 / S7.2 — el <c>TenantId</c> que se PERSISTE en una imagen de showcase tiene que salir de la
/// TIENDA de la ruta, no del claim de quien llama.
///
/// El caso solo se puede observar con un llamador cuyo tenant difiera del de la tienda: un SuperAdmin
/// sembrado en un segundo <c>Tenant</c>. Con un llamador del tenant por defecto los dos orígenes
/// coinciden y el defecto es invisible — por eso el test crea el tenant y el usuario de verdad en vez
/// de comparar dos valores que ya son iguales.
///
/// Se afirman las DOS consecuencias del mismo defecto: la fila (<c>StoreCatalogImage.TenantId</c>) y
/// la clave de almacenamiento, que se compone como
/// <c>{tenantId}/{storeId}/catalog/{kind}/{guid}{ext}</c> (<c>CatalogImageStorage.cs:88-93</c>). Una
/// fila con el tenant correcto y una clave bajo el prefijo del llamador seguirían dejando el archivo
/// fuera del árbol de la tienda, así que se comprueban las dos.
///
/// La marca (<c>UpdateStoreCatalogBrandingCommand.cs:102-106</c>) ya toma el tenant de la fila de la
/// tienda; este test fija que el showcase diga lo mismo.
/// </summary>
[Collection("e2e")]
public sealed class ShowcaseImageTenantOwnershipE2ETests
{
    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    /// <summary>`StoreCatalogImageKind`: 0 = carrusel, 1 = imágenes del día.</summary>
    private const int Carousel = 0;

    private readonly AppTestFactory _f;

    public ShowcaseImageTenantOwnershipE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ShowcaseImageDto(Guid Id, int Kind, string Key, int OrderIndex, string? Caption);

    private static string ShowcaseUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/showcase";

    /// <summary>
    /// Un SuperAdmin REAL en un tenant que NO es el de la tienda. El claim de tenant lo rellena
    /// <c>ClaimsTransformerService.cs:41</c> a partir de <c>User.TenantId</c>, así que basta con
    /// sembrar la fila del usuario bajo el segundo tenant: el token se acuña con el mismo
    /// <c>AuthedClient</c> que el resto del suite.
    ///
    /// <c>IsSuperAdmin</c> no compara tenants (<c>UserRoleRepository.cs:71-78</c>), así que el usuario
    /// sigue siendo SuperAdmin y pasa <c>AdminStoreScopeFilter</c>.
    /// </summary>
    private async Task<(Guid TenantId, Guid UserId, string Login)> SeedDivergentSuperAdminAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        Guid tenantId = Guid.NewGuid();
        db.Set<Tenant>().Add(Tenant.Create(tenantId, $"E2E Catalog Tenant {tenantId:N}", "e2e", DateTimeOffset.UtcNow));

        string login = $"sa-divergent-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Divergent Super Admin",
            "0000000000", login, tenantId);
        user.OfflinePasswordPreHash = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>()
            .Protect("Password123", user.Id);

        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.SuperAdmin, tenantId));
        await db.SaveChangesAsync();

        return (tenantId, user.Id, login);
    }

    /// <summary>La fila persistida, leída con <c>IgnoreQueryFilters</c> para ver el tenant REAL.</summary>
    private async Task<Domain.Entities.StoreCatalogImages.StoreCatalogImage> ReadImageRowAsync(Guid imageId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var row = await db.Set<Domain.Entities.StoreCatalogImages.StoreCatalogImage>().IgnoreQueryFilters()
            .SingleAsync(image => image.Id == imageId);

        return row;
    }

    /// <summary>
    /// Las imágenes de showcase tienen FK `Restrict` a `Store` y el seed de catálogo no las borra:
    /// hay que quitarlas (y `StoreCatalogSettings`) ANTES del grafo de la tienda.
    /// </summary>
    private async Task CleanupStoreAsync(WebCatalogSeed.StoreFixture store)
    {
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Domain.Entities.StoreCatalogImages.StoreCatalogImage>().IgnoreQueryFilters()
                .Where(image => image.StoreId == store.StoreId).ExecuteDeleteAsync();
            await db.Set<Domain.Entities.StoreCatalogSettings.StoreCatalogSettings>().IgnoreQueryFilters()
                .Where(settings => settings.StoreId == store.StoreId).ExecuteDeleteAsync();
        }

        await WebCatalogSeed.CleanupAsync(_f, store);
    }

    /// <summary>
    /// El handler escribe el tenant del CLAIM (<c>AddStoreCatalogImageCommand.cs:82</c>) mientras la
    /// marca lo toma de la fila de la tienda. Con un SuperAdmin de otro tenant, la fila queda bajo el
    /// tenant equivocado y la clave se compone con ese mismo prefijo: el archivo acaba en el árbol de
    /// un tenant que no es dueño de la tienda.
    /// </summary>
    [Fact]
    public async Task Post_persists_the_route_store_tenant_on_the_image_row()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var (callerTenantId, superAdminId, login) = await SeedDivergentSuperAdminAsync();
        try
        {
            callerTenantId.Should().NotBe(store.TenantId,
                "el caso solo tiene sentido si el claim y la tienda vienen de tenants distintos");

            var client = DbTestHelpers.AuthedClient(_f, superAdminId, login);

            using var content = new MultipartFormDataContent
            {
                { new StringContent(Carousel.ToString()), "kind" },
                { Jpeg(), "file", "carrusel.jpg" },
            };

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<ShowcaseImageDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var created = body.Data!;

            var row = await ReadImageRowAsync(created.Id);

            row.StoreId.Should().Be(store.StoreId);
            row.TenantId.Should().Be(store.TenantId,
                "el aislamiento de la fila lo decide la tienda destino, no el claim del llamador");

            // La clave se compone como {tenantId}/{storeId}/catalog/{kind}/{guid}{ext}: si el tenant
            // fuera el del llamador, el archivo quedaría fuera del árbol de la tienda y
            // `CatalogImageStorage.BelongsToStore` lo negaría al servirlo.
            created.Key.Should().StartWith(store.TenantId.ToString("N") + "/",
                "la clave de almacenamiento tiene que vivir bajo el tenant de la tienda");
            created.Key.Should().Contain("/" + store.StoreId.ToString("N") + "/",
                "la clave lleva la tienda en el segundo segmento");
            created.Key.Should().NotStartWith(callerTenantId.ToString("N") + "/",
                "el prefijo del tenant del llamador no pertenece a esta tienda");
        }
        finally
        {
            await CleanupStoreAsync(store);
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, callerTenantId);
        }
    }

    private static ByteArrayContent Jpeg()
    {
        var file = new ByteArrayContent(TinyJpeg);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return file;
    }
}
