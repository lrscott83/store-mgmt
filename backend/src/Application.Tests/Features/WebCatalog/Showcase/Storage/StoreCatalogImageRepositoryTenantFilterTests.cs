using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.WebCatalog.Showcase.Storage;

/// <summary>
/// El filtro global por tenant de <c>StoreCatalogImage</c> y su lectura PÚBLICA.
///
/// Esta suite es la del CRITICO que la revisión del showcase encontró: <c>StoreCatalogImage</c>
/// tiene filtro global <c>IsSuperAdmin || TenantId == TenantId</c> (fijado en
/// <c>StoreCatalogImageEntityTypeConfiguration</c>), y una petición ANÓNIMA no tiene tenant en el
/// contexto, así que el filtro no puede coincidir con NINGUNA fila — la columna es NOT NULL. Sin
/// <c>IgnoreQueryFilters</c> en <c>GetPublicByStoreIdAsync</c> el storefront vería los dos conjuntos
/// VACÍOS para siempre, aunque el dueño hubiera subido un carrusel entero. El peor tipo de fallo:
/// sin error, sin aviso, sin un 500 que lo delate.
///
/// Lo que fija, y por qué son cinco tests y no uno:
///
///   * la lectura PÚBLICA ve las filas sin tenant en el contexto, y en el ORDEN que eligió el dueño
///     (el caso que fallaba, y el orden es lo que convierte dos bloques en un carrusel);
///   * la lectura de SESIÓN NO las ve sin tenant — si esto no se cumpliera, el filtro no existiría y
///     la prueba de al lado no valdría nada;
///   * con el tenant correcto, la de sesión SÍ las ve (control positivo: el filtro no oculta todo);
///   * la pública salta el filtro, NO el criterio: sigue acotada por <c>StoreId</c>;
///   * las dos lecturas devuelven solo las ACTIVAS: "lo que el dueño ve" y "lo que ve el cliente"
///     no pueden separarse, y una imagen apagada no está configurada para ninguno de los dos.
///
/// El montaje es un <c>ApplicationDbContext</c> REAL sobre <c>InMemory</c> con la sesión simulada, el
/// mismo patrón que <c>OrderRepositoryPublicReadTests</c> y
/// <c>StoreCatalogSettingsRepositoryTenantFilterTests</c>. No es una simulación del filtro: el test
/// se apoya en el filtro GLOBAL DEL MODELO, que es el mismo objeto que PostgreSQL evalúa.
///
/// Nota de alcance: esto prueba la EFECTIVIDAD del bypass en el proveedor de tests, no en
/// PostgreSQL. Lo que lo demuestra en la base real es la suite E2E (fuera del alcance de esta
/// feature, y que aquí no se toca).
/// </summary>
public class StoreCatalogImageRepositoryTenantFilterTests
{
    /// <summary>
    /// Contexto con las imágenes de <paramref name="storeId"/>/<paramref name="tenantId"/> y las de
    /// una SEGUNDA tienda del MISMO tenant (para que el criterio que las separa sea el
    /// <c>StoreId</c> y no el filtro por tenant).
    ///
    /// Se siembran DESORDENADAS a propósito: si el orden de la consulta no fuera el del repositorio,
    /// el resultado saldría en orden de inserción y la prueba de orden pasaría sin probar nada.
    ///
    /// <paramref name="anonymous"/> simula la petición pública: sin claims, así que
    /// <c>IsSuperAdmin = false</c> y <c>TenantId</c> vacío — que en el <c>DbContext</c> es null.
    /// </summary>
    private static (ApplicationDbContext Context, StoreCatalogImageRepository Repository)
        CreateContextWithSeededImages(Guid storeId, Guid tenantId, bool anonymous)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(!anonymous);
        httpContextMock.Setup(x => x.TenantId).Returns(anonymous ? string.Empty : tenantId.ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(anonymous ? string.Empty : Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.StoreId).Returns(anonymous ? string.Empty : storeId.ToString());

        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);

        // Las 5 activas de la tienda principal, sembradas al REVÉS del orden que deben salir.
        StoreCatalogImage[] seeded =
        [
            Image(storeId, tenantId, StoreCatalogImageKind.Daily, "daily-1.png", 1),
            Image(storeId, tenantId, StoreCatalogImageKind.Carousel, "carousel-2.png", 2),
            Image(storeId, tenantId, StoreCatalogImageKind.Daily, "daily-0.png", 0),
            Image(storeId, tenantId, StoreCatalogImageKind.Carousel, "carousel-0.png", 0),
            Image(storeId, tenantId, StoreCatalogImageKind.Carousel, "carousel-1.png", 1)
        ];

        // Una APAGADA con el OrderIndex más alto: si saliera, el filtro de IsActive no se aplicaría.
        StoreCatalogImage inactive = Image(storeId, tenantId, StoreCatalogImageKind.Carousel, "carousel-off.png", 3);
        inactive.IsActive = false;
        seeded = [.. seeded, inactive];

        // Otra tienda del MISMO tenant: la lectura pública salta el filtro por tenant, así que sin el
        // criterio por StoreId estas filas se colarían en el resultado.
        seeded =
        [
            .. seeded,
            Image(Guid.NewGuid(), tenantId, StoreCatalogImageKind.Carousel, "other-0.png", 0),
            Image(Guid.NewGuid(), tenantId, StoreCatalogImageKind.Daily, "other-daily-0.png", 0)
        ];

        context.Set<StoreCatalogImage>().AddRange(seeded);
        context.SaveChanges();

        return (context, new StoreCatalogImageRepository(context));
    }

    private static StoreCatalogImage Image(Guid storeId, Guid tenantId, StoreCatalogImageKind kind,
        string key, int orderIndex)
        => StoreCatalogImage.Create(storeId, tenantId, kind, key, orderIndex, caption: null);

    /// <summary>
    /// El caso que fallaba: sin tenant en el contexto, la lectura PÚBLICA encuentra las filas y el
    /// storefront puede pintar el carrusel.
    ///
    /// El orden importa tanto como la presencia: por <c>Kind</c> y dentro de él por
    /// <c>OrderIndex</c>, que es el orden que eligió el dueño. Es el MISMO orden que usa la lectura
    /// de gestión a propósito — si difirieran, la vista y el catálogo público mostrarían el carrusel
    /// en distinto orden.
    /// </summary>
    [Fact]
    public async Task GetPublicByStoreIdAsync_WithoutATenantInContext_ShouldReturnTheRowsInOrder()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededImages(storeId, Guid.NewGuid(), anonymous: true);

        IList<StoreCatalogImage> found = await repository.GetPublicByStoreIdAsync(storeId);

        found.Select(image => image.Key).Should().Equal(
            "carousel-0.png", "carousel-1.png", "carousel-2.png",
            "daily-0.png", "daily-1.png");
        found.Select(image => image.Kind).Should().Equal(
            StoreCatalogImageKind.Carousel, StoreCatalogImageKind.Carousel, StoreCatalogImageKind.Carousel,
            StoreCatalogImageKind.Daily, StoreCatalogImageKind.Daily);
        found.Select(image => image.OrderIndex).Should().Equal(0, 1, 2, 0, 1);
        found.Should().OnlyContain(image => image.IsActive);

        context.Dispose();
    }

    /// <summary>
    /// El otro lado de la moneda: la lectura DE SESIÓN no ve esas mismas filas sin tenant. Es lo que
    /// la mantiene acotada a la tienda del contexto, y la razón de que no lleve
    /// <c>IgnoreQueryFilters</c>: quitarle el bypass abriría esa puerta.
    /// </summary>
    [Fact]
    public async Task GetByStoreIdAsync_WithoutATenantInContext_ShouldNotReturnTheRows()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededImages(storeId, Guid.NewGuid(), anonymous: true);

        IList<StoreCatalogImage> found = await repository.GetByStoreIdAsync(storeId);

        found.Should().BeEmpty();

        context.Dispose();
    }

    /// <summary>
    /// Control positivo: con el tenant de ESA tienda en el contexto, la lectura de sesión las ve, y
    /// en el MISMO orden que la pública. Sin esto, el test anterior pasaría también con un filtro que
    /// lo ocultara todo.
    ///
    /// Comprobar el orden en las dos lecturas a la vez es lo que fija que "lo que el dueño ve" y "lo
    /// que ve el cliente" no puedan divergir.
    /// </summary>
    [Fact]
    public async Task GetByStoreIdAsync_WithTheTenantInContext_ShouldReturnTheRowsInOrder()
    {
        Guid storeId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededImages(storeId, tenantId, anonymous: false);

        IList<StoreCatalogImage> found = await repository.GetByStoreIdAsync(storeId);

        found.Select(image => image.Key).Should().Equal(
            "carousel-0.png", "carousel-1.png", "carousel-2.png",
            "daily-0.png", "daily-1.png");

        context.Dispose();
    }

    /// <summary>
    /// Salta el filtro, no el criterio: la lectura pública sigue acotada por <c>StoreId</c>, así que
    /// no devuelve las filas de la otra tienda sembrada con el MISMO tenant. Sin este criterio el
    /// bypass sería una fuga entre tiendas: en el catálogo público no hay sesión que acotar, y lo único
    /// que acota es el <c>StoreId</c> que el llamador resolvió antes por un slug ÚNICO GLOBAL.
    /// </summary>
    [Fact]
    public async Task GetPublicByStoreIdAsync_ForAnotherStore_ShouldNotReturnTheRows()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededImages(storeId, Guid.NewGuid(), anonymous: true);

        IList<StoreCatalogImage> found = await repository.GetPublicByStoreIdAsync(Guid.NewGuid());

        found.Should().BeEmpty();

        context.Dispose();
    }

    /// <summary>
    /// Solo activas, en las DOS lecturas. <c>carousel-off.png</c> está sembrada con el
    /// <c>OrderIndex</c> más alto, así que si el filtro de <c>IsActive</c> no se aplicara aparecería
    /// AL FINAL de la lista y el orden del primer test lo delataría — pero se comprueba explícitamente
    /// para que el fallo no dependa de ese detalle.
    /// </summary>
    [Fact]
    public async Task GetPublicByStoreIdAsync_WithAnInactiveImage_ShouldSkipIt()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededImages(storeId, Guid.NewGuid(), anonymous: true);

        IList<StoreCatalogImage> found = await repository.GetPublicByStoreIdAsync(storeId);

        found.Should().NotContain(image => image.Key == "carousel-off.png");

        context.Dispose();
    }
}
