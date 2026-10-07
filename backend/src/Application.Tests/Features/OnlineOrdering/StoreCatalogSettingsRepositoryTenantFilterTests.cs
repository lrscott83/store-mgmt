using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Entities.StoreCatalogSettings;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El filtro global por tenant de <c>StoreCatalogSettings</c> y su lectura PÚBLICA.
///
/// Esta suite es la prueba del bloqueante que F1 encontró al montar la query pública:
/// <c>StoreCatalogSettings</c> tiene filtro global <c>IsSuperAdmin || TenantId == TenantId</c>, y
/// una petición ANÓNIMA no tiene tenant en el contexto, así que la lectura de sesión no puede
/// devolver fila. El storefront recibía entonces <c>Enabled = false</c> para siempre — sin error, sin
/// aviso, sin un 500 que delate el problema.
///
/// Lo que fija, y por qué son cuatro tests y no uno:
///   * la lectura PÚBLICA ve la fila sin tenant en el contexto (el caso que fallaba);
///   * la lectura de SESIÓN NO la ve sin tenant — si esto no se cumpliera, el filtro no existiría y
///     la prueba de al lado no valdría nada;
///   * con el tenant correcto, la de sesión SÍ la ve (control positivo: el filtro no oculta todo);
///   * la pública sigue acotada por `StoreId`: salta el filtro, no el criterio.
///
/// El montaje es un `ApplicationDbContext` real sobre `InMemory` con la sesión simulada, el mismo
/// patrón que <c>OwnerRepositoryTests</c> y <c>PlanRepositoryTests</c>.
///
/// Nota de alcance: esto prueba la EFECTIVIDAD del bypass en el proveedor de tests, no en
/// PostgreSQL. Lo que lo demuestra en la base real es la suite E2E (fuera del alcance de esta
/// feature, y que aquí no se toca). Por eso el test se apoya en el filtro GLOBAL DEL MODELO —que es
/// el mismo objeto que PostgreSQL evalúa— y no en una simulación del filtro.
/// </summary>
public class StoreCatalogSettingsRepositoryTenantFilterTests
{
    /// <summary>
    /// Contexto con una fila de configuración de `<paramref name="storeId"/>`/`<paramref name="tenantId"/>`.
    /// <paramref name="anonymous"/> simula la petición pública: sin claims, así que
    /// <c>IsSuperAdmin = false</c> y <c>TenantId</c> vacío — que en el <c>DbContext</c> es null.
    /// </summary>
    private static (ApplicationDbContext Context, StoreCatalogSettingsRepository Repository)
        CreateContextWithSeededSettings(Guid storeId, Guid tenantId, bool anonymous)
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

        StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), storeId, tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        context.Set<StoreCatalogSettings>().Add(settings);
        context.SaveChanges();

        return (context, new StoreCatalogSettingsRepository(context));
    }

    /// <summary>
    /// El caso que fallaba: sin tenant en el contexto, la lectura PÚBLICA encuentra la fila y el
    /// storefront puede ver `Enabled = true`.
    /// </summary>
    [Fact]
    public async Task GetPublicByStoreIdAsync_WithoutATenantInContext_ShouldReturnTheRow()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededSettings(storeId, Guid.NewGuid(), anonymous: true);

        StoreCatalogSettings? found = await repository.GetPublicByStoreIdAsync(storeId);

        found.Should().NotBeNull();
        found!.Enabled.Should().BeTrue();
        found.PickupEnabled.Should().BeTrue();

        context.Dispose();
    }

    /// <summary>
    /// El otro lado de la moneda: la lectura DE SESIÓN no ve esa misma fila sin tenant. Es lo que la
    /// mantiene acotada al carrito, y la razón de que no lleve `IgnoreQueryFilters`.
    /// </summary>
    [Fact]
    public async Task GetByStoreIdAsync_WithoutATenantInContext_ShouldNotReturnTheRow()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededSettings(storeId, Guid.NewGuid(), anonymous: true);

        StoreCatalogSettings? found = await repository.GetByStoreIdAsync(storeId);

        found.Should().BeNull();

        context.Dispose();
    }

    /// <summary>
    /// Control positivo: con el tenant de ESA tienda en el contexto, la lectura de sesión la ve.
    /// Sin esto, el test anterior pasaría también con un filtro que lo ocultara todo.
    /// </summary>
    [Fact]
    public async Task GetByStoreIdAsync_WithTheTenantInContext_ShouldReturnTheRow()
    {
        Guid storeId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededSettings(storeId, tenantId, anonymous: false);

        StoreCatalogSettings? found = await repository.GetByStoreIdAsync(storeId);

        found.Should().NotBeNull();
        found!.Enabled.Should().BeTrue();

        context.Dispose();
    }

    /// <summary>
    /// Salta el filtro, no el criterio: la lectura pública sigue acotada por `StoreId`, así que no
    /// devuelve la fila de otra tienda.
    /// </summary>
    [Fact]
    public async Task GetPublicByStoreIdAsync_ForAnotherStore_ShouldNotReturnTheRow()
    {
        Guid anotherStoreId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededSettings(anotherStoreId, Guid.NewGuid(), anonymous: true);

        StoreCatalogSettings? found = await repository.GetPublicByStoreIdAsync(Guid.NewGuid());

        found.Should().BeNull();

        context.Dispose();
    }
}