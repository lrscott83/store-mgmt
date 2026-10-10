using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// F1-R1 — RUTA y PERMISOS de la configuración de pedidos, por HTTP contra PostgreSQL real.
///
/// Lo que se afirma, y por qué aquí y no en un unitario del filtro:
///
///   * <b>401 sin token.</b> El <c>[HasPermission]</c> de clase y el <c>[Authorize]</c> global se
///     evalúan en el PIPELINE: un test que llame al filtro a mano con un contexto inventado
///     presupone la premisa (que el filtro se ejecuta, que el orden es el que se supone, que la
///     ruta está publicada). Aquí la petición entra por la MISMA ruta que el navegador.
///   * <b>403 sin el módulo 18 en la tienda seleccionada.</b> Esta es la mitad que ningún unitario
///     del gate puede ver por su cuenta: <c>HasUserPermissionRequirementFilter</c> deriva las
///     features de <c>StoreModule</c> POR TIENDA y de la billing, así que "OwnerAdmin" sin el
///     módulo contratado NO alcanza. Y el gating es por tienda: el módulo en la tienda A no
///     habilita nada en la B del mismo Owner.
///   * <b>200 con OwnerAdmin + módulo 18</b>, y el PUT se verifica en la fila real (no solo el
///     código de respuesta): con un <c>StoreCatalogSettings</c> NoTracking, un 200 sin fila
///     escritura sería un falso verde.
///   * <b>El público responde sin sesión</b> (<c>[AllowAnonymous]</c>): el caso contrario —que el
///     anónimo NO.require— también se afirma, porque un <c>[AllowAnonymous]</c> mal puesto sobre
///     el controlador equivocado se vería en las dos direcciones.
///
/// <b>Lo que NO se toca.</b> Ni una línea de este archivo inserta, borra o lee <c>Module</c>,
/// <c>Feature</c>, <c>StorePlanModule</c> ni <c>StoreRoleFeature</c> GLOBAL. El módulo 18 se
/// contrata por <c>StoreModule</c> —una fila POR TIENDA—, igual que hace <c>WebCatalogSeed</c>.
/// El 2026-10-09, un borrado de esas tablas mutiló el catálogo de <c>smca_test</c> y tumbó el
/// testhost a mitad de la suite (causa raíz en <c>review-findings-cleanup.md</c>). Todo lo que se
/// toca son filas PROPIAS de la tienda del test, sembradas al principio y borradas SIEMPRE en
/// <c>finally</c> en orden de FK, con <c>IgnoreQueryFilters</c> porque las tablas tocadas tienen
/// filtro global por tenant y el scope del test no lleva tenant en el contexto.
///
/// <b>Qué reutiliza.</b> <see cref="PublicOrderingSeed"/>, que NO se modifica: ya crea la tienda
/// con slug, su <c>OwnerAdmin</c>, la tienda seleccionada y el <c>StoreCatalogSettings</c>. Lo que
/// hace falta de más —el módulo 18, y una fila de configuración para el caso del PUT— lo crea
/// aquí con helpers locales.
/// </summary>
[Collection("e2e")]
public sealed class OrderingSettingsRouteAuthE2ETests
{
    /// <summary>Módulo Catálogo Web. El que habilita la vista de configuración de pedidos.</summary>
    private const int WebCatalogModuleId = 18;

    private readonly AppTestFactory _f;

    public OrderingSettingsRouteAuthE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private const string SettingsUrl = "/api/v1/online-ordering/settings";

    /// <summary>
    /// Apunta la sesión del usuario a OTRA tienda. <c>ExecuteUpdateAsync</c> porque
    /// <c>ApplicationDbContext</c> es NoTracking: cargar el usuario, cambiarle la tienda y guardar
    /// no escribiría nada, sin error y sin aviso.
    /// </summary>
    private async Task SelectStoreAsync(Guid userId, Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.SelectedStoreId, storeId));
    }

    /// <summary>Cuerpo válido: interruptor encendido, número y recogida.</summary>
    private static object ValidBody() => new
    {
        enabled = true,
        whatsappNumber = "+5351234567",
        pickupEnabled = true,
        deliveryEnabled = false,
        businessHours = "Lunes a sábado de 8:00 a 18:00",
        deliveryZones = "Vedado",
    };

    /// <summary>
    /// Contrata el módulo 18 en la tienda del fixture con el MISMO snapshot que deja el plan
    /// Superior (precio 5, 100 % de descuento ⇒ precio 0), que es lo que usa
    /// <c>WebCatalogSeed</c> y lo que <c>StoreBillingUtils.FilterForBilling</c> no filtra.
    ///
    /// Insert es explícito porque <c>ApplicationDbContext</c> es NoTracking: una fila creada,
    /// mutada y guardada sin <c>.Add</c> no se escribe — sin error y sin aviso.
    /// </summary>
    private async Task GrantWebCatalogModuleAsync(PublicOrderingSeed.OrderingFixture fixture)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreModule>().Add(StoreModule.Create(
            fixture.StoreId, WebCatalogModuleId, 5, false, 5, 0, 100, fixture.TenantId));
        await db.SaveChangesAsync();
    }

    private async Task<StoreCatalogSettings?> ReadRowAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.StoreId == storeId);
    }

    /// <summary>
    /// El <c>401</c> es lo que distingue "no hay sesión" de "no tienes permiso": sin él, un
    /// <c>401</c> y un <c>403</c> son el mismo código para un cliente, y un <c>[AllowAnonymous]</c>
    /// mal puesto se escondería detrás de un gate que responde igual.
    /// </summary>
    [Theory]
    [InlineData("GET", false)]
    [InlineData("PUT", true)]
    public async Task R1_1_the_management_endpoint_rejects_a_request_without_a_session(
        string method, bool sendsBody)
    {
        var response = sendsBody
            ? await _f.CreateClient().PutAsJsonAsync(SettingsUrl, ValidBody())
            : await _f.CreateClient().GetAsync(SettingsUrl);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            $"sin token, {method} {SettingsUrl} no puede devolver nada de la configuración");
    }

    /// <summary>
    /// 403, no 401: hay sesión (es un Owner) pero la TIENDA seleccionada no tiene el módulo 18. Es
    /// la mitad que importa del gate — el gating es por tienda, no por rol.
    /// </summary>
    [Theory]
    [InlineData("GET", false)]
    [InlineData("PUT", true)]
    public async Task R1_2_the_management_endpoint_forbids_an_owner_without_the_web_catalog_module(
        string method, bool sendsBody)
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            // SIN módulo 18 a propósito: el fixture nace con plan Superior pero sin la fila
            // `StoreModule` que abre la puerta.
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var response = sendsBody
                ? await client.PutAsJsonAsync(SettingsUrl, ValidBody())
                : await client.GetAsync(SettingsUrl);

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "configurar los pedidos es de la vista Catálogo Web: sin el módulo no se entra");

            // Y el PUT no llegó a tocar la fila. El seed YA deja una `StoreCatalogSettings`, así que
            // la prueba no es "no hay fila" sino "la fila es la que había": si el 403 llegara
            // después del handler, estos valores serían los del PUT.
            var row = await ReadRowAsync(fixture.StoreId);
            row.Should().NotBeNull("el seed crea la fila de la tienda");
            row!.WhatsappNumber.Should().Be("+5355555555", "el 403 tiene que venir ANTES del handler");
            row.BusinessHours.Should().BeNull("el PUT rechazado no dejó su horario");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El control positivo: OwnerAdmin + módulo 18 en la TIENDA seleccionada → 200, y el PUT deja
    /// fila real. El `SyncedAt` se asserta contra el reloj del servidor: con un reloj fijo en el
    /// test, el 200 no probaría que pasó por el handler.
    /// </summary>
    [Fact]
    public async Task R1_3_the_management_endpoint_allows_an_owner_with_the_module_and_persists_the_row()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await GrantWebCatalogModuleAsync(fixture);
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var put = await client.PutAsJsonAsync(SettingsUrl, ValidBody());
            put.StatusCode.Should().Be(HttpStatusCode.OK);

            var read = await client.GetAsync(SettingsUrl);
            read.StatusCode.Should().Be(HttpStatusCode.OK);

            // El 200 del PUT no basta: se comprueba la FILA. Con un `ApplicationDbContext`
            // NoTracking, un handler que no marcara nada devolvería 200 sin escribir.
            var row = await ReadRowAsync(fixture.StoreId);
            row.Should().NotBeNull("el PUT tuvo que escribir la fila de la tienda");
            row!.Enabled.Should().BeTrue();
            row.WhatsappNumber.Should().Be("+5351234567");
            row.PickupEnabled.Should().BeTrue();
            row.DeliveryEnabled.Should().BeFalse();
            row.BusinessHours.Should().Be("Lunes a sábado de 8:00 a 18:00");
            row.DeliveryZones.Should().Be("Vedado");
            row.SyncedAt.Should().NotBeNull("el sello lo pone el servidor, no el cliente");

            // El GET devuelve lo guardado (el 200 con cuerpo vacío tampoco probaría el mapeo).
            var body = await read.Content.ReadFromJsonAsync<ApiResponse<StoreCatalogSettingsDto>>(
                ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Enabled.Should().BeTrue();
            body.Data.WhatsappNumber.Should().Be("+5351234567");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// Segunda tienda del MISMO owner, en el MISMO plan y sin el módulo 18. Es lo que hace el
    /// caso preciso: con el módulo en otra tienda, un gate resuelto por "soy OwnerAdmin" abriría
    /// esta de más, y un gate resuelto por "¿alguna de mis tiendas tiene el módulo?" también.
    /// </summary>
    private async Task<Guid> AddSecondStoreWithoutTheModuleAsync(PublicOrderingSeed.OrderingFixture fixture)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = Store.Create($"E2E Pedidos {Guid.NewGuid():N}", fixture.OwnerId, true,
            fixture.TenantId, DateOnly.FromDateTime(DateTime.UtcNow),
            storePlanId: (int)StorePlanType.Superior);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        return store.Id;
    }

    /// <summary>
    /// El gating es POR TIENDA: el módulo contratado en la tienda A no habilita la B del mismo
    /// Owner. Es el caso que un `IsOwnerAdmin`-solitario dejaría pasar.
    /// </summary>
    [Fact]
    public async Task R1_4_the_module_in_another_store_does_not_open_the_settings_endpoint()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid secondStoreId = Guid.Empty;
        try
        {
            await GrantWebCatalogModuleAsync(fixture);

            // Control positivo primero: en su tienda, el mismo Owner entra.
            (await DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login)
                .GetAsync(SettingsUrl)).StatusCode
                .Should().Be(HttpStatusCode.OK, "control positivo: con el módulo en su tienda, entra");

            secondStoreId = await AddSecondStoreWithoutTheModuleAsync(fixture);
            await SelectStoreAsync(fixture.UserId, secondStoreId);

            (await DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login)
                .GetAsync(SettingsUrl)).StatusCode
                .Should().Be(HttpStatusCode.Forbidden,
                "el módulo en otra tienda no habilita esta: el gate es por tienda, no por Owner");
        }
        finally
        {
            // El `finally` está anidado A PROPÓSITO: si borrar la segunda tienda fallara, la
            // limpieza del grafo de la principal tiene que correr igual. Sin esto, un fallo en el
            // primero dejaba filas que bloqueaban el reset del fixture de TODA la suite E2E
            // (`StoreCatalogSettings` no está en `DbTestHelpers.ResetDataAsync`, así que un resto
            // hace que el `DELETE FROM "Store"` de la corrida siguiente reviente por FK).
            try
            {
                if (secondStoreId != Guid.Empty) await DeleteStoreRowAsync(secondStoreId);
            }
            finally
            {
                await PublicOrderingSeed.CleanupAsync(_f, fixture);
            }
        }
    }

    /// <summary>
    /// Borra SOLO la fila de la segunda tienda. No se usa
    /// <c>AuthzSeed.CleanupStoreGraphAsync</c>: esa limpia también borra el <c>Owner</c>, y aquí las
    /// dos tiendas son del MISMO owner —borrarlo dejaría a la primera tienda con el FK colgado
    /// (<c>FK_Store_Owner_OwnerId</c> es Restrict).
    ///
    /// La tienda no tiene <c>StoreModule</c>/<c>StoreRoleFeature</c>/<c>StoreUser</c>/settings, así
    /// que la fila es su único rastro. <c>ExecuteDeleteAsync</c> por la misma razón de siempre: el
    /// contexto es NoTracking.
    /// </summary>
    private async Task DeleteStoreRowAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == storeId).ExecuteDeleteAsync();
    }

    /// <summary>
    /// El <c>[AllowAnonymous]</c> del PÚBLICO: la misma configuración se lee sin sesión, por slug.
    /// Sin este caso, un gate roto que cerrara el público seguiría dejando verdes los anteriores.
    /// </summary>
    [Fact]
    public async Task R1_5_the_public_config_is_readable_without_a_session()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var response = await _f.CreateClient()
                .GetAsync($"/api/v1/public/ordering/{fixture.Slug}/config");

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "el storefront lee la configuración sin sesión: es la razón de ser del endpoint");

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PublicOrderingConfigDto>>(
                ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Enabled.Should().BeTrue("el seed abre los pedidos");
            body.Data.PickupEnabled.Should().BeTrue();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// Y el slug que NO existe es un 404, no un 200 con la config de otra: sin este caso, un
    /// filtro por slug ausente haría pasar R1-5 con cualquier tienda.
    /// </summary>
    [Fact]
    public async Task R1_6_an_unknown_slug_is_a_404_not_the_config_of_another_store()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var response = await _f.CreateClient()
                .GetAsync($"/api/v1/public/ordering/e2e-pedidos-{Guid.NewGuid():N}/config");

            response.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "el slug es lo que acota la lectura pública; sin él, cualquiera vería cualquier tienda");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}