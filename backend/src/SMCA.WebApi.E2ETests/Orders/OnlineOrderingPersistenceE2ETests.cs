using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// F2-R2 — la PERSISTENCIA que F2 añadió se probaba solo con Moq: cada repositorio devolvía lo que
/// el test le mandaba, así que ninguna de sus decisiones reales estaba verificada.
///
/// Los tres repositorios de la lista:
///   * <c>StoreCatalogSettingsRepository.UpsertAsync</c> — el UPDATE vs INSERT y, sobre todo, el
///     <c>EntityState.Modified</c> que hace falta porque <c>ApplicationDbContext</c> es
///     <c>NoTracking</c>;
///   * <c>OrderRepository.CodeExistsAsync</c> / <c>GetByCodeAsync</c> — el <c>IgnoreQueryFilters</c>
///     del primero y el filtro global POR TENANT del segundo, que son decisiones opuestas;
///   * <c>ProductRepository.GetPublishedByIdsAsync</c> — las cuatro puertas de publicación.
///
/// <b>Por qué E2E y no un test de infraestructura con InMemory.</b> InMemory no es SQL: ejecuta el
/// filtro global como predicado en memoria y acepta cualquier clave primaria, así que un
/// <c>UPDATE</c> de una fila que no existe "funciona" y un índice único inexistente no se nota. Las
/// dos cosas que este archivo verifica —que el UPDATE de una fila real no viola nada y que el
/// INSERT duplicado SÍ lo haría— solo existen en PostgreSQL.
///
/// <b>Por qué no se toca el catálogo.</b> Ni una línea de este archivo inserta, borra o lee
/// <c>Module</c>, <c>Feature</c>, <c>StorePlanModule</c> ni <c>StoreRoleFeature</c>. El 2026-10-09
/// ese borrado corrompió el catálogo de <c>smca_test</c> y tumbó el testhost a mitad de la suite
/// (ver <c>review-findings-cleanup.md</c>, causa raíz de <c>PlanModuleConvergenceTests</c>). Todo lo
/// que se toca aquí son filas PROPIAS de la tienda del test, sembradas al principio y borradas
/// SIEMPRE en <c>finally</c>, en orden de FK (líneas → pedido → configuración → productos →
/// categorías → grafo de tienda), con <c>IgnoreQueryFilters</c> porque las tres primeras tablas
/// tienen filtro global por tenant y el scope del test no lleva tenant en el contexto.
///
/// <b>Qué reutiliza.</b> <see cref="PublicOrderingSeed"/>, que NO se modifica: ya crea tienda con
/// slug, categoría con slug, producto publicado y configuración con pedidos abiertos. Lo que este
/// archivo necesita de más (productos NO publicados, una segunda tienda) lo crea con helpers
/// locales.
/// </summary>
[Collection("e2e")]
public sealed class OnlineOrderingPersistenceE2ETests
{
    private readonly AppTestFactory _f;

    public OnlineOrderingPersistenceE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// Scope nuevo por operación: <c>ApplicationDbContext</c> es scoped y cada uno nace SIN tenant en
    /// el contexto (no hay petición HTTP detrás), que es justo el estado en el que hay que probar
    /// los <c>IgnoreQueryFilters</c>.
    /// </summary>
    private async Task<T> WithDbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = _f.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    private async Task WithDbAsync(Func<ApplicationDbContext, Task> action)
        => await WithDbAsync<object?>(async db =>
        {
            await action(db);
            return null;
        });

    #region R2-1 / R2-2 / R2-3 — UpsertAsync: INSERT y UPDATE sobre la fila real

    /// <summary>
    /// R2-1 — la rama de ALTA: <c>UpsertAsync</c> sobre una tienda SIN configuración escribe UNA
    /// fila, con el id que trajo el caller y los valores que se le pusieron.
    ///
    /// Lo que prueba que esta es de verdad la rama del INSERT es el índice ÚNICO de <c>StoreId</c>:
    /// si el método tomara la del UPDATE (<c>EntityState.Modified</c> sobre una clave que no
    /// existe), PostgreSQL respondería «UPDATE de 0 filas» y el test caería con un error de base de
    /// datos, no con una aserción.
    /// </summary>
    [Fact]
    public async Task R2_1_upsert_inserts_the_first_row_of_a_store_that_has_none()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            // Punto de partida: la tienda NO tiene configuración, que es como nace una que nunca
            // abrió los pedidos. El borrado afecta solo a filas PROPIAS de esta tienda.
            await WithDbAsync(async db => await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
                .Where(s => s.StoreId == fixture.StoreId).ExecuteDeleteAsync());

            Guid newId = Guid.NewGuid();
            await WithDbAsync(async db =>
            {
                var repository = new StoreCatalogSettingsRepository(db);

                // El id se fija al NACER porque `Entity<TId>.Id` es `init`: es lo que hace el
                // handler de F1 y lo que el upsert tiene que respetar.
                StoreCatalogSettings settings =
                    StoreCatalogSettings.Create(newId, fixture.StoreId, fixture.TenantId);
                settings.Enabled = true;
                settings.WhatsappNumber = "+5355555555";

                await repository.UpsertAsync(settings);
                await db.SaveChangesAsync();
            });

            List<StoreCatalogSettings> rows = await ReadSettingsAsync(fixture.StoreId);

            rows.Should().HaveCount(1, "una fila por tienda (índice único de StoreId, D7)");
            rows[0].Id.Should().Be(newId, "el alta conserva el id que trajo el caller");
            rows[0].Enabled.Should().BeTrue();
            rows[0].WhatsappNumber.Should().Be("+5355555555");
            rows[0].TenantId.Should().Be(fixture.TenantId);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// R2-2 — la rama de ACTUALIZACIÓN, que es donde está el <c>NoTracking</c>.
    ///
    /// <c>ApplicationDbContext</c> es <c>NoTracking</c>: la fila que vuelve de
    /// <c>GetPublicByStoreIdAsync</c> llega DESACOPLADA. Mutarla y llamar a <c>SaveChanges</c> sin
    /// más no escribe NADA —ni error, ni aviso, ni «0 filas», simplemente nada—. Por eso
    /// <c>UpsertAsync</c> marca la entidad antes de guardar.
    ///
    /// La sonda (1) deja constancia del agujero: sin <c>UpsertAsync</c> el cambio se pierde en
    /// silencio. La sonda (2) es la mitad UPDATE: si el método tomara la del INSERT, el índice único
    /// de <c>StoreId</c> lo rechazaría por clave duplicada. Las dos ramas se distinguen EN LA BASE
    /// REAL, no por la forma del código.
    /// </summary>
    [Fact]
    public async Task R2_2_upsert_updates_the_loaded_row_that_a_plain_save_changes_would_silently_drop()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        const string nuevoNumero = "+53 5-777 8888";
        try
        {
            // (1) La trampa del NoTracking: mutar la fila CARGADA y guardar sin marcar nada.
            await WithDbAsync(async db =>
            {
                var repository = new StoreCatalogSettingsRepository(db);
                StoreCatalogSettings? loaded = await repository.GetPublicByStoreIdAsync(fixture.StoreId);
                loaded.Should().NotBeNull();

                loaded!.WhatsappNumber = nuevoNumero;
                await db.SaveChangesAsync();

                db.ChangeTracker.Entries<StoreCatalogSettings>()
                    .Should().BeEmpty("la entidad leída con NoTracking entra DESACOPLADA: EF no tiene nada que escribir");
            });

            (await ReadSettingsAsync(fixture.StoreId)).Single().WhatsappNumber
                .Should().NotBe(nuevoNumero,
                    "un SaveChanges sin marcar no escribe nada, y no avisa de que no lo hizo");

            // (2) El upsert sí la escribe, sobre la MISMA fila.
            await WithDbAsync(async db =>
            {
                var repository = new StoreCatalogSettingsRepository(db);
                StoreCatalogSettings? loaded = await repository.GetPublicByStoreIdAsync(fixture.StoreId);
                loaded.Should().NotBeNull();

                loaded!.WhatsappNumber = nuevoNumero;
                await repository.UpsertAsync(loaded);
                await db.SaveChangesAsync();
            });

            List<StoreCatalogSettings> rows = await ReadSettingsAsync(fixture.StoreId);

            rows.Should().HaveCount(1, "actualizar NO inserta una segunda fila de la misma tienda");
            rows[0].WhatsappNumber.Should().Be(nuevoNumero);
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// R2-3 — deja demostrado de paso por qué <b>F2-R5 es un falso positivo</b>:
    /// <c>StoreCatalogSettings</c> NO es soft-deletable. El filtro global de la tabla es SOLO por
    /// tenant —no hay <c>HasQueryFilter(x =&gt; x.IsActive)</c> ni entidad <c>IDeleteableEntity</c>—,
    /// así que una fila "dada de baja" con <c>IsActive = false</c> la sigue viendo la lectura de
    /// sesión, el <c>AnyAsync</c> del upsert la encuentra, y guardar va por la rama del UPDATE.
    ///
    /// Si en algún día esta tabla se vuelve soft-deletable de verdad (filtro por
    /// <c>IsActive</c>), este test CAE —que es lo que tiene que pasar: sería el momento de volver
    /// a plantear el índice parcial, y este archivo avisa de que el día llegó.
    /// </summary>
    [Fact]
    public async Task R2_3_an_inactive_row_stays_visible_and_the_upsert_reactivates_it_in_place()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await WithDbAsync(async db =>
            {
                db.SetTenantContext(fixture.TenantId, isSuperAdmin: false);
                var repository = new StoreCatalogSettingsRepository(db);
                StoreCatalogSettings? loaded = await repository.GetByStoreIdAsync(fixture.StoreId);
                loaded.Should().NotBeNull();

                loaded!.IsActive = false;
                await repository.UpsertAsync(loaded);
                await db.SaveChangesAsync();
            });

            // La fila "dada de baja" la sigue viendo la lectura DE SESIÓN: el filtro global de esta
            // tabla es por tenant, no por IsActive. Por eso el índice único no la esconde nunca.
            (await WithDbAsync(async db =>
            {
                db.SetTenantContext(fixture.TenantId, isSuperAdmin: false);
                StoreCatalogSettings? read = await new StoreCatalogSettingsRepository(db)
                    .GetByStoreIdAsync(fixture.StoreId);
                read.Should().NotBeNull();
                return read!.IsActive;
            })).Should().BeFalse("la fila está, solo que marcada como inactiva");

            // Reactivarla es un UPDATE sobre la misma fila, no un alta que choque con el índice.
            await WithDbAsync(async db =>
            {
                var repository = new StoreCatalogSettingsRepository(db);
                StoreCatalogSettings? loaded = await repository.GetPublicByStoreIdAsync(fixture.StoreId);
                loaded!.IsActive = true;
                await repository.UpsertAsync(loaded);
                await db.SaveChangesAsync();
            });

            List<StoreCatalogSettings> rows = await ReadSettingsAsync(fixture.StoreId);
            rows.Should().HaveCount(1, "reactivar no inserta una fila nueva");
            rows[0].IsActive.Should().BeTrue();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    private Task<List<StoreCatalogSettings>> ReadSettingsAsync(Guid storeId)
        => WithDbAsync(db => db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .Where(s => s.StoreId == storeId).ToListAsync());

    #endregion

    #region R2-4 — OrderRepository.CodeExistsAsync: el bypass del filtro de tenant

    /// <summary>
    /// R2-4 — <c>CodeExistsAsync</c> es la comprobación que permite REINTENTAR con otro código en
    /// vez de devolver un 500 por colisión, así que su respuesta tiene que ser la real aunque el
    /// contexto no tenga tenant. De ahí su <c>IgnoreQueryFilters</c>: el filtro global es por
    /// TENANT, y un pedido de otra tienda del mismo tenant también ocupa el código —sin el bypass,
    /// el generador creería libre un código ya usado y el índice único <c>(StoreId, Code)</c>
    /// reventaría en el <c>SaveChanges</c>, que es exactamente el 500 que el retry evita.
    ///
    /// La segunda mitad es la sonda que hace que la primera valga: sin ella, un <c>true</c> en esta
    /// base no distingue «el bypass funciona» de «el filtro global no llega a traducirse a SQL», que
    /// es justo lo que un Provider como InMemory escondería.
    /// </summary>
    [Fact]
    public async Task R2_4_code_exists_finds_the_row_even_without_a_tenant_in_the_context()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2ER2AA";
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, code);

            await WithDbAsync(async db =>
            {
                var repository = new OrderRepository(db);

                (await repository.CodeExistsAsync(fixture.StoreId, code)).Should().BeTrue(
                    "el código está ocupado en esta tienda");
                (await repository.CodeExistsAsync(other.StoreId, code)).Should().BeFalse(
                    "salta el filtro por tenant, NO el criterio: el código se compara por tienda");
                (await repository.CodeExistsAsync(fixture.StoreId, "ZZZZZZ")).Should().BeFalse();
            });

            // Sonda: en este MISMO scope, la consulta filtrada no ve nada y la que lo ignora sí.
            await WithDbAsync(async db =>
            {
                db.SetTenantContext(tenantId: null, isSuperAdmin: false);
                (await db.Set<Order>()
                        .Where(o => o.StoreId == fixture.StoreId && o.Code == code).ToListAsync())
                    .Should().BeEmpty("el filtro global por tenant no matchea sin tenant en el contexto");
                (await db.Set<Order>().IgnoreQueryFilters()
                        .Where(o => o.StoreId == fixture.StoreId && o.Code == code).ToListAsync())
                    .Should().HaveCount(1, "la fila está: lo que la esconde es el filtro, no su ausencia");
            });
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
            await PublicOrderingSeed.CleanupAsync(_f, other);
        }
    }

    #endregion

    #region R2-5 — OrderRepository.GetByCodeAsync: con sesión sí, sin sesión no

    /// <summary>
    /// R2-5 — el otro lado de la moneda, y por eso la sonda va aquí: <c>GetByCodeAsync</c> es la
    /// lectura DE SESIÓN y NO lleva bypass. Es lo que confina el pedido a la tienda de la sesión; el
    /// E2E de F3 (R1-2) es el que demuestra que quitarle el filtro rompería ese aislamiento.
    ///
    /// Lo que este caso añade es lo que ningún unitario puede ver en esta base: las LÍNEAS llegan
    /// cargadas. <c>OrderItem</c> tiene su PROPIO filtro por tenant, así que un <c>Include</c> que
    /// no llegara a las líneas daría un pedido sin artículos —y eso se comprueba contra PostgreSQL,
    /// no contra un predicado en memoria.
    /// </summary>
    [Fact]
    public async Task R2_5_get_by_code_returns_the_order_with_its_lines_for_a_session_of_that_tenant()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        const string code = "E2ER2BB";
        try
        {
            Order seeded = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, code);

            await WithDbAsync(async db =>
            {
                db.SetTenantContext(fixture.TenantId, isSuperAdmin: false);
                var repository = new OrderRepository(db);

                Order? found = await repository.GetByCodeAsync(fixture.StoreId, code);

                found.Should().NotBeNull();
                found!.Id.Should().Be(seeded.Id);
                found.OrderItems.Should().ContainSingle("el Include tiene que llegar a las líneas");
                found.OrderItems.Single().Name.Should().Be(fixture.ProductName);
                found.OrderItems.Single().Price.Should().Be(PublicOrderingSeed.ProductPrice);

                // Acotada por tienda, no solo por código: el mismo código en OTRA tienda no existe.
                (await repository.GetByCodeAsync(other.StoreId, code)).Should().BeNull();
            });

            // Sin tenant en el contexto (una petición anónima) la lectura de sesión NO ve la fila.
            await WithDbAsync(async db =>
            {
                db.SetTenantContext(tenantId: null, isSuperAdmin: false);
                (await new OrderRepository(db).GetByCodeAsync(fixture.StoreId, code))
                    .Should().BeNull("sin tenant en el contexto, la lectura de sesión no devuelve nada");
            });
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
            await PublicOrderingSeed.CleanupAsync(_f, other);
        }
    }

    #endregion

    #region R2-6 — ProductRepository.GetPublishedByIdsAsync: las cuatro puertas de publicación

    /// <summary>
    /// R2-6 — la consulta que lee el carrito del pedido. Lo que decide el importe guardado son sus
    /// CUATRO puertas (producto activo, en venta, categoría activa, categoría con slug público) más
    /// la pertenencia a la tienda; y lo que decide el fallo es que el handler la convierta en 400
    /// cuando el id no aparece: un producto que el catálogo ya no publica NO entra, porque
    /// aceptarlo guardaría un precio que ya no existe.
    ///
    /// Los ids van de uno en uno para que el fallo diga PUERTA y no «algo del filtro»: cada producto
    /// sembrado rompe exactamente una y la lista de consulta es la misma para todos.
    /// </summary>
    [Fact]
    public async Task R2_6_get_published_by_ids_returns_only_what_the_catalog_publishes()
    {
        var first = await PublicOrderingSeed.SeedAsync(_f);
        var second = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            // Las cuatro puertas rotas, una por una, todas en la tienda `first`, que es la que
            // pregunta. El producto de `second` está CORRECTAMENTE publicado: lo que lo excluye es
            // la tienda, no su publicación.
            Guid inactivo = await SeedProductAsync(first, "E2E Inactivo", availableToSale: true, isActive: false);
            Guid noEnVenta = await SeedProductAsync(first, "E2E No En Venta", availableToSale: false);
            Guid sinSlug = await SeedProductAsync(first, "E2E Sin Slug", categoryWithSlug: false);
            Guid categoriaInactiva = await SeedProductAsync(
                first, "E2E Categoria Inactiva", categoryWithSlug: true, categoryActive: false);

            var ids = new List<Guid>
            {
                first.ProductId, inactivo, noEnVenta, sinSlug, categoriaInactiva, second.ProductId,
            };

            await WithDbAsync(async db =>
            {
                IList<Product> published =
                    await new ProductRepository(db).GetPublishedByIdsAsync(first.StoreId, ids);

                published.Should().ContainSingle(
                    "de los seis ids solo entra el producto realmente publicado de la tienda consultada");
                published[0].Id.Should().Be(first.ProductId);
                published[0].Price.Should().Be(PublicOrderingSeed.ProductPrice);
                published[0].Category.Should().NotBeNull("la consulta incluye la categoría a propósito");
            });

            // Y al revés: el mismo producto SÍ aparece cuando se pregunta por SU tienda. Sin esta
            // mitad, el único caso verde podría explicarse por un filtro que no devuelve nada nunca.
            (await WithDbAsync(async db =>
            {
                IList<Product> published = await new ProductRepository(db)
                    .GetPublishedByIdsAsync(second.StoreId, ids);
                return published.Select(product => product.Id).ToList();
            }))
                .Should().BeEquivalentTo(new[] { second.ProductId },
                    "la tienda consultada es el criterio, y cada tienda ve lo suyo");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, first);
            await PublicOrderingSeed.CleanupAsync(_f, second);
        }
    }

    /// <summary>
    /// R2-6-b — el caso límite: sin ids no hay consulta. El handler deduplica con <c>Distinct</c>
    /// antes de llamar, así que una lista vacía solo llega si el carrito llegó vacío —y el handler ya
    /// lo rechaza antes—. Aun así, el <c>ids.Count == 0</c> del repositorio existe para no mandar un
    /// <c>IN ()</c> a PostgreSQL, y esto lo fija.
    /// </summary>
    [Fact]
    public async Task R2_6b_get_published_by_ids_with_no_ids_returns_nothing()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            (await WithDbAsync(async db =>
            {
                IList<Product> published = await new ProductRepository(db)
                    .GetPublishedByIdsAsync(fixture.StoreId, Array.Empty<Guid>());
                return published;
            }))
                .Should().BeEmpty();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// Producto del catálogo de la tienda del test con exactamente UNA puerta rota. Devuelve el id
    /// para meterlo en la lista de consulta. El alta es un <c>Add</c> explícito porque el contexto
    /// es NoTracking, y toda la fila cae dentro del <c>CleanupAsync</c> del seed (borra los productos
    /// y las categorías de la tienda).
    /// </summary>
    private async Task<Guid> SeedProductAsync(
        PublicOrderingSeed.OrderingFixture fixture,
        string name,
        bool availableToSale = true,
        bool isActive = true,
        bool categoryWithSlug = true,
        bool categoryActive = true)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        ProductCategory category = ProductCategory.Create(
            fixture.StoreId, name, 2, fixture.TenantId,
            slug: categoryWithSlug ? $"e2e-categoria-{Guid.NewGuid():N}" : null);
        category.IsActive = categoryActive;
        db.Set<ProductCategory>().Add(category);
        await db.SaveChangesAsync();

        Product product = Product.Create(
            name, category.Id, PublicOrderingSeed.ProductPrice, 2,
            availableToSale, true, $"B-{Guid.NewGuid():N}", fixture.TenantId);
        product.IsActive = isActive;
        db.Set<Product>().Add(product);
        await db.SaveChangesAsync();

        return product.Id;
    }

    #endregion
}