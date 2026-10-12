using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.UpsertStoreCatalogSettings;
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
    /// <summary>Módulo Pedidos WhatsApp (19): el que habilita la CONFIGURACIÓN de pedidos.</summary>
    private const int PedidosWhatsAppModuleId = 19;

    /// <summary>Módulo Catálogo Web (18): NO habilita la configuración de pedidos.</summary>
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
    /// Cuerpo válido con los TRES campos de texto rellenos de <b>padding</b>: lo que se manda es
    /// más largo que la columna, pero lo que queda RECORTADO cabe exacto.
    /// <para>
    /// Es la forma de atar la decisión del VALIDADOR (<c>FitsAfterTrim</c>, que mide el valor
    /// recortado) a lo que se PERSISTE de verdad. El riesgo del que este caso protege es
    /// concreto: si el validador midiera el crudo y aceptara, o si midiera el recortado pero el
    /// handler guardara otra cosa —sin recortar, o con un recorte distinto—, la columna (32/512)
    /// se rompería con un 500 en el INSERT en vez de un 400 con mensaje. Aquí el 200 y la fila
    /// real son la prueba de que las dos medidas coinciden con lo que acaba en la base.
    /// </para>
    /// <para>
    /// Se usan las constantes de PRODUCCIÓN del comando, no números escritos a mano: son los topes
    /// que el validador mide y los que el DTO escribe.
    /// </para>
    /// </summary>
    private static object PaddedBodyToTheColumnLimit() => new
    {
        enabled = true,
        whatsappNumber = new string(' ', 4)
            + new string('9', UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength)
            + new string(' ', 4),
        pickupEnabled = true,
        deliveryEnabled = false,
        businessHours = "\n  "
            + new string('a', UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength)
            + "  \t",
        deliveryZones = new string(' ', 3)
            + new string('b', UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength)
            + new string(' ', 3),
    };

    /// <summary>
    /// El MISMO relleno pero con el contenido un carácter POR ENCIMA del tope: recortado sigue
    /// sobrando, y tiene que rechazarse. Sin este control, "acepta lo que cabe recortado" podría
    /// haberse implementado como "no mide nada".
    /// </summary>
    private static object PaddedBodyOverTheColumnLimit() => new
    {
        enabled = true,
        whatsappNumber = new string(' ', 4)
            + new string('9', UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength + 1)
            + new string(' ', 4),
        pickupEnabled = true,
        deliveryEnabled = false,
        businessHours = "\n  "
            + new string('a', UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength + 1)
            + "  \t",
        deliveryZones = new string(' ', 3)
            + new string('b', UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength + 1)
            + new string(' ', 3),
    };

    /// <summary>Contrata el módulo 18 (Catálogo Web) en una tienda: NO debe abrir la config de pedidos.</summary>
    private async Task GrantWebCatalogModuleAsync(Guid storeId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreModule>().Add(StoreModule.Create(
            storeId, WebCatalogModuleId, 5, false, 5, 0, 100, tenantId));
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
    /// 403, no 401: hay sesión (es un Owner) pero la TIENDA seleccionada NO tiene el módulo 19
    /// (Pedidos WhatsApp). El fixture es Superior, y ese plan YA incluye el 19, así que la única
    /// forma de representar "sin el módulo" es una tienda en un plan inferior (Gratis).
    /// </summary>
    [Theory]
    [InlineData("GET", false)]
    [InlineData("PUT", true)]
    public async Task R1_2_the_management_endpoint_forbids_an_owner_without_the_ordering_module(
        string method, bool sendsBody)
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid storeId = Guid.Empty;
        try
        {
            storeId = await AddLowerPlanStoreAsync(fixture);
            await SeedSettingsRowAsync(storeId, fixture.TenantId, "+5355555555");
            await SelectStoreAsync(fixture.UserId, storeId);

            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var response = sendsBody
                ? await client.PutAsJsonAsync(SettingsUrl, ValidBody())
                : await client.GetAsync(SettingsUrl);

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "configurar los pedidos es de la vista Pedidos WhatsApp: sin el módulo 19 no se entra");

            // Y el PUT no llegó a tocar la fila: si el 403 llegara DESPUÉS del handler, estos
            // valores serían los del PUT.
            var row = await ReadRowAsync(storeId);
            row.Should().NotBeNull();
            row!.WhatsappNumber.Should().Be("+5355555555", "el 403 tiene que venir ANTES del handler");
            row.BusinessHours.Should().BeNull("el PUT rechazado no dejó su horario");
        }
        finally
        {
            if (storeId != Guid.Empty) await DeleteStoreGraphAsync(storeId);
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El gate distingue los DOS módulos: con el 18 (Catálogo Web) pero SIN el 19 (Pedidos WhatsApp)
    /// es un 403. Antes el 18 abría esta vista —un falso 200 que dejaba configurar pedidos que el
    /// storefront nunca leería.
    /// </summary>
    [Theory]
    [InlineData("GET", false)]
    [InlineData("PUT", true)]
    public async Task R1_9_an_owner_with_the_web_catalog_module_but_not_the_ordering_module_is_forbidden(
        string method, bool sendsBody)
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid storeId = Guid.Empty;
        try
        {
            storeId = await AddLowerPlanStoreAsync(fixture);
            await GrantWebCatalogModuleAsync(storeId, fixture.TenantId);
            await SelectStoreAsync(fixture.UserId, storeId);

            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            var response = sendsBody
                ? await client.PutAsJsonAsync(SettingsUrl, ValidBody())
                : await client.GetAsync(SettingsUrl);

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "el módulo 18 (catálogo web) NO habilita la configuración de pedidos: es del módulo 19");
        }
        finally
        {
            if (storeId != Guid.Empty) await DeleteStoreGraphAsync(storeId);
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
    /// <summary>
    /// Tienda del MISMO owner en un plan INFERIOR (Gratis), que NO incluye el módulo 19. Es la única
    /// forma de representar "sin el módulo": el fixture nace en Superior, y el plan Superior YA trae
    /// el 19 en su catálogo de módulos.
    /// </summary>
    private async Task<Guid> AddLowerPlanStoreAsync(PublicOrderingSeed.OrderingFixture fixture)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = Store.Create($"E2E Pedidos Gratis {Guid.NewGuid():N}", fixture.OwnerId, true,
            fixture.TenantId, DateOnly.FromDateTime(DateTime.UtcNow),
            storePlanId: (int)StorePlanType.Gratis);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        return store.Id;
    }

    /// <summary>Fila de configuración para una tienda creada por el test (el seed solo crea la del fixture).</summary>
    private async Task SeedSettingsRowAsync(Guid storeId, Guid tenantId, string whatsapp)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var settings = StoreCatalogSettings.Create(storeId, tenantId);
        settings.WhatsappNumber = whatsapp;
        db.Set<StoreCatalogSettings>().Add(settings);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Borra SOLO el grafo de una tienda creada por el test (settings → módulos → tienda), sin tocar
    /// el owner: las dos tiendas son del MISMO owner (borrarlo colgaría el FK de la primera).
    /// `ExecuteDeleteAsync` porque el contexto es NoTracking.
    /// </summary>
    private async Task DeleteStoreGraphAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .Where(s => s.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(m => m.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == storeId).ExecuteDeleteAsync();
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

            // Control positivo primero: en su tienda, el mismo Owner entra.
            (await DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login)
                .GetAsync(SettingsUrl)).StatusCode
                .Should().Be(HttpStatusCode.OK, "control positivo: con el módulo en su tienda, entra");

            secondStoreId = await AddLowerPlanStoreAsync(fixture);
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
                if (secondStoreId != Guid.Empty) await DeleteStoreGraphAsync(secondStoreId);
            }
            finally
            {
                await PublicOrderingSeed.CleanupAsync(_f, fixture);
            }
        }
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

    /// <summary>
    /// F1-R3-002 — la decisión del VALIDADOR atada al VALOR PERSISTIDO.
    /// <para>
    /// <c>FitsAfterTrim</c> mide <c>(value ?? "").Trim().Length</c> y el handler escribe
    /// <c>IsNullOrWhiteSpace(value) ? null : value.Trim()</c>. Son dos <c>Trim()</c> distintos
    /// escritos en dos capas, y el único modo de que diverjan sin que nadie se entere es un valor
    /// que el validador mida corto y el handler escriba largo — que es justo lo que revienta la
    /// columna con un 500 en el INSERT.
    /// </para>
    /// <para>
    /// Por eso el caso no se queda en el validador (los unitarios de
    /// <c>UpsertStoreCatalogSettingsCommandValidatorTests</c> ya lo cubren, y solo miran la decisión)
    /// y sube por HTTP hasta la FILA: un número con 4 espacios a cada lado que ocupa 40
    /// caracteres crudos y 32 recortados. Si el handler no recortara, el 200 no habría llegado: la
    /// base lo habría tirado. Y si el validador midiera el crudo, el 400 habría llegado antes. El
    /// 200 con los 32 dígitos EXACTOS en la fila es lo que dice que las dos medidas son la misma.
    /// </para>
    /// </summary>
    [Fact]
    public async Task R1_7_a_padded_value_that_fits_once_trimmed_is_persisted_trimmed()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var put = await client.PutAsJsonAsync(SettingsUrl, PaddedBodyToTheColumnLimit());

            put.StatusCode.Should().Be(HttpStatusCode.OK,
                "lo que se manda excede la columna, pero lo que se PERSISTE (recortado) cabe exacto: "
                + "si el validador midiera el crudo sería un 400, y si el handler no recortara sería un 500 en el INSERT");

            var row = await ReadRowAsync(fixture.StoreId);
            row.Should().NotBeNull();

            // Lo guardado es lo RECORTADO, con la longitud exacta de la columna. Ni el padding ni
            // un carácter de más: la fila leída es la prueba, no el 200.
            row!.WhatsappNumber.Should().Be(
                new string('9', UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength),
                "el handler persiste el valor recortado, que es exactamente lo que el validador midió");
            row.WhatsappNumber!.Length.Should().Be(
                UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength,
                "el número ocupa la columna entera, sin un carácter de sobra");

            // Los otros dos: el `Trim` del handler también recorta los saltos de línea y las
            // tabulaciones del borde, no solo los espacios.
            row.BusinessHours.Should().Be(
                new string('a', UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength));
            row.DeliveryZones.Should().Be(
                new string('b', UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength));

            // Y el GET devuelve lo mismo que la fila: el DTO no re-corta ni expande.
            var body = await client.GetAsync(SettingsUrl);
            body.StatusCode.Should().Be(HttpStatusCode.OK);
            var read = await body.Content.ReadFromJsonAsync<ApiResponse<StoreCatalogSettingsDto>>(
                ApiResponse.Json);
            read!.Data!.WhatsappNumber.Should().Be(row.WhatsappNumber,
                "lo que el dueño vuelve a leer es lo recortado, no lo que escribió");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El control negativo del caso anterior, y el que demuestra que el anterior no pasó por
    /// gracia. Un carácter de más SOBRE EL TOPE ya recortado se rechaza con un 400 —no con un
    /// 500 de columna— y la fila se queda como estaba: el recorte no es una licencia para meter un
    /// texto infinito, solo cambia sobre qué se mide.
    /// </summary>
    [Fact]
    public async Task R1_8_a_padded_value_over_the_limit_once_trimmed_is_rejected_and_the_row_is_untouched()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var before = await ReadRowAsync(fixture.StoreId);
            before.Should().NotBeNull();

            var put = await client.PutAsJsonAsync(SettingsUrl, PaddedBodyOverTheColumnLimit());

            put.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "recortado sigue estando sobre el tope de la columna: es un 400 con mensaje, no un 500 en el INSERT");

            var after = await ReadRowAsync(fixture.StoreId);
            after.Should().NotBeNull();
            after!.WhatsappNumber.Should().Be(before!.WhatsappNumber,
                "el rechazo tiene que venir ANTES del handler: la fila es la que había");
            after.BusinessHours.Should().Be(before.BusinessHours);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}