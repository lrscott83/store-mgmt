using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Application.Dtos.WebCatalog;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using Domain.Entities.Owners;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

// Alias con nombres DISTINTOS de los del DTO: `WebCatalogSeed` declara en este mismo namespace
// records con los nombres `PublicCatalogDto`/`PublicCatalogPageDto`, y un miembro del namespace
// gana al alias de `using` en la resolución de nombres. Con alias propios se lee el DTO real de
// `Application`, que es el que el endpoint serializa.
using PublicCatalogHeader = Application.Dtos.WebCatalog.PublicCatalogDto;
using PublicCatalogPage = Application.Dtos.WebCatalog.PublicCatalogPageDto;
using PublicCatalogProductCard = Application.Dtos.WebCatalog.PublicCatalogProductDto;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Catálogo web en modo MAYORISTA, de punta a punta contra PostgreSQL: la puerta de publicación
/// (S2), el bloque de precios que viaja al cliente (S4/S6), el pedido que el SERVIDOR cotiza por
/// escalón y guarda con su snapshot (S5), y la minimización de datos cuando el modo es `Unit`.
///
/// Lo que solo se puede fijar aquí, y no en los unitarios (InMemory):
///   * la puerta <c>product.WholesaleTiers.Any()</c> se traduce a <c>EXISTS</c> en SQL y filtra la
///     lista, los conteos por categoría, la búsqueda y el detalle — un InMemory "pasa" sin probar
///     la traducción;
///   * la config mayorista vive en una TABLA aparte (<c>ProductWholesaleTier</c>) que el handler
///     del pedido lee por producto: sin base real no hay fila que leer;
///   * las columnas de snapshot de <c>OrderItem</c> y <c>Order.IsOfflineOrder</c> son mapeo EF y
///     defaults de columna, no lógica en memoria;
///   * el numerador de la conversión es una consulta SQL que filtra <c>!IsOfflineOrder</c>.
///
/// El archivo es NUEVO y autosuficiente a propósito: siembra y limpia su propio grafo aquí dentro
/// (S9: no se toca ningún E2E existente ni <c>PublicOrderingSeed</c>).
/// </summary>
[Collection("e2e")]
public sealed class WholesaleCatalogE2ETests
{
    // Cifras del escenario. El precio unitario del primer escalón (80) es DISTINTO del minorista
    // (100) a propósito: si el servidor cobrara el precio de unidad, el total cambiaría y la prueba
    // lo vería. Lo mismo con el tamaño del paquete (12) y la cantidad pedida (36 = 3 paquetes).
    private const decimal RetailPrice = 100m;
    private const decimal SecondProductPrice = 150m;
    private const int PackSize = 12;
    private const decimal TierOneUnitPrice = 80m;
    private const decimal TierTwoUnitPrice = 70m;
    private const int TierOneMinPacks = 3;
    private const int TierTwoMinPacks = 10;
    private const string UnitLabel = "cajas";

    /// <summary>Unidades pedidas: 36 = 3 paquetes de 12, que cae en el primer escalón (80/unidad).</summary>
    private const int OrderedUnits = 36;
    private const int OrderedPacks = OrderedUnits / PackSize;
    private const decimal ExpectedTotal = OrderedUnits * TierOneUnitPrice;

    /// <summary>Cantidad que NO es múltiplo del paquete: 30 = 2 paquetes y 6 unidades sueltas.</summary>
    private const int NonPackMultipleUnits = 30;

    /// <summary>
    /// Unidades del SEGUNDO escalón: 120 = 10 paquetes de 12, que alcanzan el mínimo de 10 paquetes
    /// y por tanto cobran 70 por unidad en vez de 80. Sin este caso, un handler que siempre aplicara
    /// el primer escalón pasaría toda la suite.
    /// </summary>
    private const int SecondTierOrderedUnits = TierTwoMinPacks * PackSize;
    private const int SecondTierOrderedPacks = TierTwoMinPacks;
    private const decimal ExpectedSecondTierTotal = SecondTierOrderedUnits * TierTwoUnitPrice;

    /// <summary>
    /// Paquetes por DEBAJO del primer mínimo: 1 paquete de 12 unidades contra un mínimo de 3.
    /// El POS saca la línea del carrito en este caso, así que el servidor tiene que rechazar.
    /// </summary>
    private const int BelowFirstTierUnits = PackSize;

    private readonly AppTestFactory _f;

    public WholesaleCatalogE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    // --- S2: la puerta es SQL, no memoria ------------------------------------------------

    [Fact]
    public async Task Wholesale_mode_hides_products_without_a_valid_config_from_every_public_read()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            var client = _f.CreateClient();

            // 1. Cabecera: el modo publicado y el conteo de la categoría. Los conteos salen de la
            //    MISMA consulta agrupada que el listado, así que aquí se ve si el `EXISTS` filtró.
            PublicCatalogHeader header = await GetHeaderAsync(client, fixture.Slug);
            header.PriceMode.Should().Be(nameof(CatalogPriceMode.Wholesale));
            header.Categories.Should().ContainSingle("la tienda tiene una sola categoría sembrada");
            header.Categories[0].ProductsCount.Should().Be(1,
                "el producto sin config válida no entra en el conteo de la categoría");

            // 2. Listado completo.
            PublicCatalogPage page = await GetPageAsync(client, fixture.Slug);
            page.Total.Should().Be(1);
            page.Items.Should().ContainSingle();
            page.Items[0].Id.Should().Be(fixture.ValidProductId);
            page.Items.Select(item => item.Id).Should().NotContain(fixture.InvalidProductId,
                "el producto con WholesaleEnabled=false no se publica en modo mayorista");

            // 3. Búsqueda por el nombre del producto oculto: la puerta también aplica al filtro.
            PublicCatalogPage search = await GetPageAsync(client, fixture.Slug,
                $"&search={Uri.EscapeDataString(fixture.InvalidProductName)}");
            search.Total.Should().Be(0);
            search.Items.Should().BeEmpty("buscar el producto oculto no puede devolverlo");

            // 4. Detalle: la misma puerta lo convierte en un 404, no en una ficha con datos vacíos.
            var detail = await client.GetAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/products/{fixture.InvalidProductId}");
            detail.StatusCode.Should().Be(HttpStatusCode.NotFound);

            // Y el producto válido SÍ tiene ficha: el 404 de arriba no es "el detalle está roto".
            var validDetail = await client.GetAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/products/{fixture.ValidProductId}");
            validDetail.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    // --- S4/S6: lo que el carrito necesita para hablar en paquetes ------------------------

    [Fact]
    public async Task Wholesale_mode_publishes_pack_size_tiers_and_first_tier_numbers_ordered_by_min_packs()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            var client = _f.CreateClient();

            PublicCatalogPage page = await GetPageAsync(client, fixture.Slug);
            PublicCatalogProductCard product = page.Items.Should().ContainSingle().Subject;

            product.PriceMode.Should().Be(nameof(CatalogPriceMode.Wholesale));
            product.WholesaleEnabled.Should().BeTrue();
            product.WholesalePackSize.Should().Be(PackSize);
            product.WholesaleUnitLabel.Should().Be(UnitLabel, "es lo que el resumen de WhatsApp imprime");
            product.WholesaleMinPacks.Should().Be(TierOneMinPacks,
                "el mínimo vendible es el `minPacks` del escalón más bajo");
            product.WholesaleUnitPrice.Should().Be(TierOneUnitPrice,
                "el precio del primer escalón es POR UNIDAD dentro del paquete");
            product.WholesalePackPrice.Should().Be(PackSize * TierOneUnitPrice,
                "un paquete cuesta lo que sus 12 unidades al precio del escalón");

            product.WholesaleTiers.Should().HaveCount(2);
            product.WholesaleTiers.Select(tier => tier.MinPacks).Should().Equal(
                TierOneMinPacks, TierTwoMinPacks);
            product.WholesaleTiers.Select(tier => tier.MinPacks).Should().BeInAscendingOrder(
                "el contrato es ascendente por `minPacks`, y el orden de lectura de la tabla no lo impone");
            product.WholesaleTiers.Select(tier => tier.PricePerUnit).Should().Equal(
                TierOneUnitPrice, TierTwoUnitPrice);
            product.WholesaleTiers.Select(tier => tier.PackPrice).Should().Equal(
                PackSize * TierOneUnitPrice, PackSize * TierTwoUnitPrice);

            // El detalle (lo que se abre al tocar la tarjeta) publica el mismo bloque: una segunda
            // ruta de lectura que podría quedarse sin el `Include` de los escalones.
            var detailResponse = await client.GetAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/products/{fixture.ValidProductId}");
            detailResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var detailBody = await detailResponse.Content
                .ReadFromJsonAsync<ApiResponse<PublicCatalogProductCard>>(ApiResponse.Json);
            PublicCatalogProductCard detail = detailBody!.Data!;
            detail.WholesalePackSize.Should().Be(PackSize);
            detail.WholesaleMinPacks.Should().Be(TierOneMinPacks);
            detail.WholesaleUnitPrice.Should().Be(TierOneUnitPrice);
            detail.WholesaleTiers.Select(tier => tier.MinPacks).Should().Equal(
                TierOneMinPacks, TierTwoMinPacks);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    // --- S5: el SERVIDOR cotiza, tipa y guarda el snapshot -------------------------------

    /// <summary>
    /// El pedido del SEGUNDO escalón. Con un fixture de paquete 12 y escalones `3 -> 80` y
    /// `10 -> 70`, 10 paquetes tienen que cobrarse a 70 por unidad y congelar el escalón 10.
    ///
    /// Existe porque el caso del primer escalón (3 paquetes) NO distingue un handler correcto de uno
    /// que siempre aplica el escalón más bajo: los dos dan el mismo precio ahí. El número 70 solo
    /// aparece si el handler elige el escalón por el número de paquetes.
    /// </summary>
    [Fact]
    public async Task Posting_a_second_tier_quantity_prices_the_order_at_the_second_tier()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            var client = _f.CreateClient();

            var response = await client.PostAsJsonAsync(
                $"/api/v1/public/ordering/{fixture.Slug}/orders",
                OrderBody(fixture, SecondTierOrderedUnits));

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderCreatedDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            OnlineOrderCreatedDto created = body.Data!;

            created.Subtotal.Should().Be(ExpectedSecondTierTotal,
                "120 unidades × 70: el escalón de 10 paquetes, no el de 3");
            created.Total.Should().Be(ExpectedSecondTierTotal);

            OnlineOrderCreatedLineDto line = created.Lines.Should().ContainSingle().Subject;
            line.Quantity.Should().Be(SecondTierOrderedUnits);
            line.Price.Should().Be(TierTwoUnitPrice, "el precio es el del escalón alcanzado, no el del primero");
            line.Packs.Should().Be(SecondTierOrderedPacks);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            Order order = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                .SingleAsync(row => row.StoreId == fixture.StoreId);
            order.Total.Should().Be(ExpectedSecondTierTotal);

            OrderItem item = await db.Set<OrderItem>().IgnoreQueryFilters().AsNoTracking()
                .SingleAsync(row => row.OrderId == order.Id);
            item.Price.Should().Be(TierTwoUnitPrice);
            item.Quantity.Should().Be(SecondTierOrderedUnits);
            item.WholesaleTierMinPacks.Should().Be(TierTwoMinPacks,
                "el snapshot tiene que nombrar el escalón APLICADO, no el primero");
            item.WholesaleTierUnitPrice.Should().Be(TierTwoUnitPrice);
            item.WholesalePacks.Should().Be(SecondTierOrderedPacks);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    /// <summary>
    /// Por debajo del primer mínimo no hay precio mayorista que cobrar: 1 paquete contra un mínimo de
    /// 3 es un 400 y NO deja fila. Es el otro borde que un handler "siempre el primer escalón"
    /// también dejaría pasar, vendiendo al detal por la puerta de atrás.
    /// </summary>
    [Fact]
    public async Task Posting_below_the_first_tier_is_rejected_and_writes_no_order()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            var client = _f.CreateClient();

            var response = await client.PostAsJsonAsync(
                $"/api/v1/public/ordering/{fixture.Slug}/orders",
                OrderBody(fixture, BelowFirstTierUnits));

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderCreatedDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Order>().IgnoreQueryFilters()
                .CountAsync(row => row.StoreId == fixture.StoreId))
                .Should().Be(0, "un pedido rechazado no puede dejar fila");
            List<Guid> orderIds = await db.Set<Order>().IgnoreQueryFilters()
                .Where(row => row.StoreId == fixture.StoreId)
                .Select(row => row.Id).ToListAsync();
            (await db.Set<OrderItem>().IgnoreQueryFilters()
                .CountAsync(row => orderIds.Contains(row.OrderId)))
                .Should().Be(0);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }


    [Fact]
    public async Task Posting_a_pack_quantity_prices_the_order_at_wholesale_and_persists_the_snapshot()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            var client = _f.CreateClient();

            var response = await client.PostAsJsonAsync(
                $"/api/v1/public/ordering/{fixture.Slug}/orders",
                OrderBody(fixture, OrderedUnits));

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderCreatedDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            OnlineOrderCreatedDto created = body.Data!;

            // Lo que el cliente ve y manda al WhatsApp: 3 paquetes de 12, a 80 la unidad.
            created.Subtotal.Should().Be(ExpectedTotal);
            created.Total.Should().Be(ExpectedTotal);
            created.Currency.Should().Be(Currency.CUP);
            OnlineOrderCreatedLineDto line = created.Lines.Should().ContainSingle().Subject;
            line.Name.Should().Be(fixture.ValidProductName);
            line.Quantity.Should().Be(OrderedUnits,
                "la cantidad de la línea sigue siendo UNIDADES: el paquete es la forma de cobrar");
            line.Price.Should().Be(TierOneUnitPrice, "el servidor cobró el escalón, no el precio minorista");
            line.Packs.Should().Be(OrderedPacks, "el resumen dice '3 cajas', no '36 unidades'");
            line.UnitLabel.Should().Be(UnitLabel);
            created.WhatsappNumber.Should().Be(fixture.WhatsappNumber);

            // Las FILAS: tipo real + canal, y el snapshot mayorista por línea.
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            Order order = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                .SingleAsync(row => row.StoreId == fixture.StoreId);
            order.Id.Should().Be(created.Id);
            order.Code.Should().Be(created.Code);
            order.OrderType.Should().Be(OrderType.Mayorista);
            ((int)order.OrderType).Should().Be(2, "`Mayorista` es 2 en el enum persistido");
            order.IsOfflineOrder.Should().BeFalse("un pedido del catálogo es del SERVIDOR, no del POS");
            order.Total.Should().Be(ExpectedTotal);
            // `ItemsCount` es la SUMA DE CANTIDADES (`Order.CreateOnline`), no el número de líneas:
            // una sola línea de 36 unidades mide 36. Confundirlo con el conteo de líneas es el
            // error fácil aquí, y el snapshot de abajo es el que prueba que la línea es una sola.
            order.ItemsCount.Should().Be(OrderedUnits);

            OrderItem item = await db.Set<OrderItem>().IgnoreQueryFilters().AsNoTracking()
                .SingleAsync(row => row.OrderId == order.Id);
            item.ProductId.Should().Be(fixture.ValidProductId);
            item.Quantity.Should().Be(OrderedUnits);
            item.Price.Should().Be(TierOneUnitPrice);
            item.WholesalePackSize.Should().Be(PackSize);
            item.WholesalePacks.Should().Be(OrderedPacks);
            item.WholesaleTierMinPacks.Should().Be(TierOneMinPacks);
            item.WholesaleTierUnitPrice.Should().Be(TierOneUnitPrice);
            item.WholesaleUnitLabel.Should().Be(UnitLabel);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task A_quantity_that_is_not_a_pack_multiple_is_rejected_and_writes_no_order()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            var client = _f.CreateClient();

            var response = await client.PostAsJsonAsync(
                $"/api/v1/public/ordering/{fixture.Slug}/orders",
                OrderBody(fixture, NonPackMultipleUnits));

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderCreatedDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            // 30 no es múltiplo de 12: el mensaje es la FRASE COMPLETA de
            // `OnlineOrderWholesaleQuantityMustBeAPackMultiple`, con el id del producto y el tamaño
            // del paquete interpolados. El contrato no expone un código de error estable, así que la
            // frase es la única identidad disponible; buscar el número "12" dejaba pasar cualquier
            // otro 400 que lo mencionara (un nombre de producto, un id, un límite).
            // La cultura está FIJADA en español (`UseLocalizationExtension` solo admite "es" y no hay
            // I18n.es.resx, así que se resuelve el resx neutro), por eso la frase se afirma en
            // español y no por traducción.
            body.Errors.Should().ContainSingle()
                .Which.Description.Should().Be(
                    $"La cantidad del producto {fixture.ValidProductId} debe ser múltiplo de {PackSize} "
                    + "unidades, que es el tamaño del paquete");

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Order>().IgnoreQueryFilters()
                .CountAsync(row => row.StoreId == fixture.StoreId))
                .Should().Be(0, "un pedido rechazado no puede dejar fila");
            List<Guid> orderIds = await db.Set<Order>().IgnoreQueryFilters()
                .Where(row => row.StoreId == fixture.StoreId)
                .Select(row => row.Id).ToListAsync();
            (await db.Set<OrderItem>().IgnoreQueryFilters()
                .CountAsync(row => orderIds.Contains(row.OrderId)))
                .Should().Be(0);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    // --- S5: la métrica cuenta el pedido del catálogo -------------------------------------

    [Fact]
    public async Task The_online_order_conversion_counts_the_wholesale_catalog_order()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        Guid? adminId = null;
        try
        {
            string adminLogin = $"sa-wholesale-{Guid.NewGuid():N}@test.com";
            adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
            var admin = DbTestHelpers.AuthedClient(_f, adminId.Value, adminLogin);

            // Antes: la tienda no tiene pedidos online, así que la conversión no puede contarlos.
            (await GetOrdersMetricAsync(admin, fixture.StoreId)).Should().Be(0);

            var client = _f.CreateClient();
            var response = await client.PostAsJsonAsync(
                $"/api/v1/public/ordering/{fixture.Slug}/orders",
                OrderBody(fixture, OrderedUnits));
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            // Después: el numerador es `!IsOfflineOrder`, no el tipo, así que un pedido MAYORISTA
            // del catálogo tiene que sumar igual que uno Normal.
            (await GetOrdersMetricAsync(admin, fixture.StoreId)).Should().Be(1);
        }
        finally
        {
            await CleanupAsync(fixture);
            if (adminId is { } id)
                await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    // --- S5 (contract): en modo Unit no se publica un solo número mayorista ---------------

    [Fact]
    public async Task Unit_mode_publishes_the_retail_price_and_no_wholesale_number_at_all()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            await FlipPriceModeAsync(fixture.StoreId, CatalogPriceMode.Unit);

            var client = _f.CreateClient();

            PublicCatalogHeader header = await GetHeaderAsync(client, fixture.Slug);
            header.PriceMode.Should().Be(nameof(CatalogPriceMode.Unit));

            PublicCatalogPage page = await GetPageAsync(client, fixture.Slug);
            // La puerta mayorista NO aplica en Unit: el producto sin config válida vuelve a salir.
            page.Total.Should().Be(2);
            page.Items.Should().HaveCount(2);

            PublicCatalogProductCard valid = page.Items
                .Single(item => item.Id == fixture.ValidProductId);
            valid.Price.Should().Be(RetailPrice);
            valid.FinalPrice.Should().Be(RetailPrice, "en Unit el catálogo publica el precio minorista");
            valid.PriceMode.Should().Be(nameof(CatalogPriceMode.Unit));

            // Minimización de datos (R1-001): aunque la config mayorista sigue GUARDADA en la base,
            // el JSON anónimo no lleva ni un número de la lista al por mayor.
            valid.WholesaleEnabled.Should().BeFalse("en modo Unit el DTO no afirma nada del otro modo");
            valid.WholesalePackSize.Should().Be(0);
            valid.WholesaleUnitLabel.Should().BeNull();
            valid.WholesaleMinPacks.Should().BeNull();
            valid.WholesaleUnitPrice.Should().BeNull();
            valid.WholesalePackPrice.Should().BeNull();
            valid.WholesaleTiers.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    // --- Regresión: los escalones se leen SIN sesión --------------------------------------

    /// <summary>
    /// REGRESIÓN del defecto que este archivo destapó: el alta del pedido público corre ANÓNIMA,
    /// así que `_context.TenantId` es null y el filtro global por tenant del escalón se traduce a
    /// `= NULL` — CERO filas. Una lectura sin bypass devolvía una lista vacía, y el catálogo
    /// publicaba precios que el pedido luego rechazaba como "no configurado".
    ///
    /// El bypass vive ahora en `GetForPublicOrderAsync`, NO en `GetByProductIdAsync`: la lectura con
    /// sesión conserva el filtro (es su razón de ser), y el pedido anónimo usa la variante que
    /// ignora los filtros y acota por el tenant de la TIENDA que el slug resolvió. Este test fija el
    /// camino real del request: el contexto anónimo más el tenant explícito.
    ///
    /// Se reproduce el contexto EXACTO del request: un scope del MISMO contenedor de servicios que
    /// atiende el `POST` público, con el contexto de tenant puesto en anónimo a mano
    /// (`tenantId: null`, `isSuperAdmin: false`). Un InMemory no ve el filtro; por eso la prueba es
    /// de base.
    /// </summary>
    [Fact]
    public async Task Anonymous_context_reads_the_persisted_tiers_ordered_by_min_packs()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            // El mismo estado que un visitante anónimo: sin sesión no hay tenant ni SuperAdmin.
            db.SetTenantContext(tenantId: null, isSuperAdmin: false);

            var tierRepository = scope.ServiceProvider
                .GetRequiredService<IProductWholesaleTierRepository>();
            IList<ProductWholesaleTier> tiers = await tierRepository.GetForPublicOrderAsync(
                fixture.ValidProductId, fixture.TenantId, CancellationToken.None);

            tiers.Should().HaveCount(2,
                "un contexto anónimo tiene que ver los escalones: si no, ningún pedido mayorista pasa");
            tiers.Select(tier => tier.MinPacks).Should().Equal(TierOneMinPacks, TierTwoMinPacks);
            // `Equal` sobre la secuencia ya prueba el ORDEN: el escalón aplicable es el de mínimo
            // más alto, así que una lectura desordenada cambiaría qué precio se cobra.
            tiers.Select(tier => tier.PricePerUnit).Should().Equal(TierOneUnitPrice, TierTwoUnitPrice);
            tiers.Should().OnlyContain(tier => tier.ProductId == fixture.ValidProductId);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    // --- El filtro por tenant sigue vivo en la lectura con sesión --------------------------

    /// <summary>
    /// `GetByProductIdAsync` es la lectura SEGURA por defecto: conserva el filtro global por tenant,
    /// así que un llamador del tenant A que pide el producto del tenant B obtiene CERO filas aunque
    /// las filas existan. Es exactamente lo que se pierde cuando el método ignora TODOS los filtros
    /// (`IgnoreQueryFilters`) para que el pedido anónimo funcione.
    ///
    /// La segunda mitad de la prueba —el mismo tenant leyendo sus propios escalones— es la que
    /// distingue "el filtro filtró" de "la tabla estaba vacía": sin ella, un repositorio roto que no
    /// devolviera nunca nada también pasaría.
    /// </summary>
    [Fact]
    public async Task Tenant_filtered_tiers_read_returns_nothing_for_another_tenants_product()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var tierRepository = scope.ServiceProvider
                .GetRequiredService<IProductWholesaleTierRepository>();

            // El tenant DUEÑO: las filas están ahí.
            db.SetTenantContext(tenantId: fixture.TenantId, isSuperAdmin: false);
            IList<ProductWholesaleTier> own = await tierRepository.GetByProductIdAsync(fixture.ValidProductId);
            own.Should().HaveCount(2, "el tenant dueño lee sus propios escalones");

            // Otro tenant, el MISMO id de producto: las filas siguen existiendo, pero son ajenas.
            db.SetTenantContext(tenantId: Guid.NewGuid(), isSuperAdmin: false);
            IList<ProductWholesaleTier> foreign = await tierRepository.GetByProductIdAsync(fixture.ValidProductId);
            foreign.Should().BeEmpty(
                "una lectura con sesión no puede cruzar tenants: el filtro global tiene que seguir aplicando");
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    // --- El bypass del pedido anónimo está acotado por el tenant de la tienda ---------------

    /// <summary>
    /// La lectura del pedido PÚBLICO sí ignora los filtros globales (sin sesión el filtro por tenant
    /// devuelve cero filas), pero el tenant explícito va en el `WHERE`: con el tenant de la tienda
    /// devuelve los escalones, con otro tenant devuelve NADA aunque el id de producto sea el correcto.
    ///
    /// La segunda mitad es la que importa: sin ella, el bypass sería exactamente el agujero que la
    /// versión anterior dejaba abierto — "ignora todos los filtros y confía en que el llamador pase
    /// un id bueno".
    /// </summary>
    [Fact]
    public async Task Public_order_tiers_read_is_bounded_by_the_given_tenant()
    {
        var fixture = await SeedAsync(priceMode: CatalogPriceMode.Wholesale);
        try
        {
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            // El contexto del request anónimo, que es donde el bypass hace falta.
            db.SetTenantContext(tenantId: null, isSuperAdmin: false);
            var tierRepository = scope.ServiceProvider
                .GetRequiredService<IProductWholesaleTierRepository>();

            IList<ProductWholesaleTier> mine = await tierRepository.GetForPublicOrderAsync(
                fixture.ValidProductId, fixture.TenantId, CancellationToken.None);
            mine.Should().HaveCount(2, "el tenant de la tienda ve sus escalones desde un contexto anónimo");
            mine.Select(tier => tier.MinPacks).Should().Equal(TierOneMinPacks, TierTwoMinPacks);
            mine.Select(tier => tier.PricePerUnit).Should().Equal(TierOneUnitPrice, TierTwoUnitPrice);

            IList<ProductWholesaleTier> otherTenant = await tierRepository.GetForPublicOrderAsync(
                fixture.ValidProductId, Guid.NewGuid(), CancellationToken.None);
            otherTenant.Should().BeEmpty(
                "el bypass se acota por el tenant explícito, no por la confianza en el llamador");
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    // --- HTTP helpers ---------------------------------------------------------------------

    private static async Task<PublicCatalogHeader> GetHeaderAsync(HttpClient client, string slug)
    {
        var response = await client.GetAsync($"/api/v1/public/catalog/{slug}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content
            .ReadFromJsonAsync<ApiResponse<PublicCatalogHeader>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private static async Task<PublicCatalogPage> GetPageAsync(HttpClient client, string slug,
        string extraQuery = "")
    {
        var response = await client.GetAsync(
            $"/api/v1/public/catalog/{slug}/products?pageSize=60{extraQuery}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content
            .ReadFromJsonAsync<ApiResponse<PublicCatalogPage>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private static async Task<int> GetOrdersMetricAsync(HttpClient admin, Guid storeId)
    {
        var response = await admin.GetFromJsonAsync<ApiResponse<CatalogStatsDto>>(
            $"/api/v1/stores/{storeId}/catalog-stats?days=7", ApiResponse.Json);
        response!.Succeeded.Should().BeTrue();
        return response.Data!.Orders;
    }

    /// <summary>
    /// Cuerpo del POST público: qué producto y cuántas UNIDADES. Sin precios — el servidor los
    /// resuelve del catálogo, que es justo lo que esta prueba mide.
    /// </summary>
    private static object OrderBody(StoreFixture fixture, int units) => new
    {
        deliveryType = (int)OrderDeliveryType.Pickup,
        customerName = "Cliente Mayorista E2E",
        customerPhone = "+5355555555",
        items = new[] { new { productId = fixture.ValidProductId, quantity = units } },
    };

    private async Task FlipPriceModeAsync(Guid storeId, CatalogPriceMode mode)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // `ExecuteUpdate` es SQL directo sobre la fila: `ApplicationDbContext` es NoTracking, así
        // que una entidad leída y mutada no se escribiría. `IgnoreQueryFilters` porque el filtro
        // global es por tenant y el scope del test no tiene uno.
        int updated = await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .Where(settings => settings.StoreId == storeId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(settings => settings.PriceMode, mode));
        updated.Should().Be(1, "el modo tiene que quedar escrito o la prueba no mide nada");
    }

    // --- Siembra y limpieza ---------------------------------------------------------------

    private sealed record StoreFixture(
        Guid UserId,
        string Login,
        Guid StoreId,
        Guid TenantId,
        string Slug,
        Guid ValidProductId,
        string ValidProductName,
        Guid InvalidProductId,
        string InvalidProductName,
        string WhatsappNumber);

    /// <summary>
    /// Una tienda con catálogo público y pedidos ABIERTOS, dos productos publicados y el modo de
    /// precio pedido:
    ///
    ///   * <c>ValidProductId</c> — config mayorista COMPLETA (activada, paquete 12, unidad "cajas",
    ///     escalones 3→80 y 10→70). Es el único que el modo mayorista publica.
    ///   * <c>InvalidProductId</c> — precio minorista 150 y paquete/escalón presentes pero
    ///     <c>WholesaleEnabled = false</c>. Prueba que la BANDERA es la que cierra la puerta, no la
    ///     ausencia de los otros datos; y en modo Unit vuelve a publicarse.
    ///
    /// Todo con GUIDs frescos: el slug es la clave del rate limit de pedidos, así que cada test
    /// estrena su propio cubo y no hereda permisos gastados.
    /// </summary>
    private async Task<StoreFixture> SeedAsync(CatalogPriceMode priceMode)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Guid tenantId = DataUtils.DefaultTenant.Id;

        string login = $"wmay-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Wholesale Catalog Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Wholesale Catalog owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        string slug = $"e2e-mayorista-{Guid.NewGuid():N}";
        var store = Store.Create($"E2E Mayorista {Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow), storePlanId: (int)StorePlanType.Superior);
        // El slug se fija EN EL ALTA (no con un UPDATE posterior): el contexto es NoTracking.
        store.CatalogSlug = slug;
        db.Set<Store>().Add(store);

        // Módulo 19 (PedidosWhatsApp): sin su fila el POST responde 400 y no se llega al precio.
        db.Set<StoreModule>().Add(
            StoreModule.Create(store.Id, (int)ModuleType.PedidosWhatsApp, 0, true, 0, 0, 0, tenantId));
        db.Set<StoreModule>().Add(
            StoreModule.Create(store.Id, (int)ModuleType.GestionPedidos, 0, true, 0, 0, 0, tenantId));

        var category = ProductCategory.Create(store.Id, "E2E Mayorista", 1, tenantId,
            slug: $"e2e-cat-mayorista-{Guid.NewGuid():N}");
        db.Set<ProductCategory>().Add(category);
        await db.SaveChangesAsync();

        var validProduct = Product.Create($"E2E Cerveza {Guid.NewGuid():N}", category.Id, RetailPrice, 1,
            availableToSale: true, discountFromInventory: true, $"B-{Guid.NewGuid():N}", tenantId);
        validProduct.WholesaleEnabled = true;
        validProduct.WholesalePackSize = PackSize;
        validProduct.WholesaleUnitLabel = UnitLabel;
        db.Set<Product>().Add(validProduct);

        db.Set<ProductWholesaleTier>().Add(ProductWholesaleTier.Create(
            validProduct.Id, TierOneMinPacks, TierOneUnitPrice, Currency.CUP, tenantId));
        db.Set<ProductWholesaleTier>().Add(ProductWholesaleTier.Create(
            validProduct.Id, TierTwoMinPacks, TierTwoUnitPrice, Currency.CUP, tenantId));

        var invalidProduct = Product.Create($"E2E SinMayorista {Guid.NewGuid():N}", category.Id,
            SecondProductPrice, 2, availableToSale: true, discountFromInventory: true,
            $"B-{Guid.NewGuid():N}", tenantId);
        // Paquete y escalón presentes, bandera apagada: la config está incompleta por decisión del
        // dueño, que es exactamente el caso que la puerta tiene que ocultar.
        invalidProduct.WholesaleEnabled = false;
        invalidProduct.WholesalePackSize = PackSize;
        invalidProduct.WholesaleUnitLabel = UnitLabel;
        db.Set<Product>().Add(invalidProduct);
        db.Set<ProductWholesaleTier>().Add(ProductWholesaleTier.Create(
            invalidProduct.Id, TierOneMinPacks, TierOneUnitPrice - 20m, Currency.CUP, tenantId));

        var settings = StoreCatalogSettings.Create(store.Id, tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        settings.DeliveryEnabled = true;
        settings.WhatsappNumber = "+5355555555";
        settings.PriceMode = priceMode;
        db.Set<StoreCatalogSettings>().Add(settings);

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();

        return new StoreFixture(user.Id, login, store.Id, tenantId, slug, validProduct.Id,
            validProduct.Name, invalidProduct.Id, invalidProduct.Name, settings.WhatsappNumber);
    }

    /// <summary>
    /// Borra lo sembrado en orden de FK (todas Restrict): pedidos antes que productos, escalones
    /// antes que el producto, y al final el grafo de la tienda. `IgnoreQueryFilters` en todas
    /// porque el scope del test no tiene tenant.
    ///
    /// Los escalones NO los limpia ningún helper compartido: son la tabla nueva de esta feature y
    /// el producto padre no se puede borrar mientras existan (FK Restrict).
    /// </summary>
    private async Task CleanupAsync(StoreFixture fixture)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Los ids de pedido se resuelven primero: con un contexto NoTracking y borrados en bloque,
        // la subconsulta explícita es lo que evita depender de la navegación `OrderItem.Order`.
        List<Guid> orderIds = await db.Set<Order>().IgnoreQueryFilters()
            .Where(order => order.StoreId == fixture.StoreId)
            .Select(order => order.Id).ToListAsync();
        await db.Set<OrderItem>().IgnoreQueryFilters()
            .Where(item => orderIds.Contains(item.OrderId)).ExecuteDeleteAsync();
        await db.Set<Order>().IgnoreQueryFilters()
            .Where(order => orderIds.Contains(order.Id)).ExecuteDeleteAsync();
        await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .Where(settings => settings.StoreId == fixture.StoreId).ExecuteDeleteAsync();

        var productIds = await db.Set<Product>().IgnoreQueryFilters()
            .Where(product => product.Category.StoreId == fixture.StoreId)
            .Select(product => product.Id).ToListAsync();
        await db.Set<ProductWholesaleTier>().IgnoreQueryFilters()
            .Where(tier => productIds.Contains(tier.ProductId)).ExecuteDeleteAsync();
        await db.Set<Product>().IgnoreQueryFilters()
            .Where(product => productIds.Contains(product.Id)).ExecuteDeleteAsync();
        await db.Set<ProductCategory>().IgnoreQueryFilters()
            .Where(category => category.StoreId == fixture.StoreId).ExecuteDeleteAsync();

        await AuthzSeed.CleanupStoreGraphAsync(_f, fixture.StoreId, fixture.UserId);
    }
}
