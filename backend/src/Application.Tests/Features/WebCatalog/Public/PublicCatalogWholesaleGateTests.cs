using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// S2 del catálogo web con precio mayorista: en modo `Wholesale` NO se publica un producto sin
/// configuración mayorista válida (activada + paquete positivo + al menos un escalón), igual que la
/// venta mayorista del POS no lo ofrece. La puerta vive en el SQL del repositorio, así que este
/// test la ejerce sobre un `ApplicationDbContext` real (InMemory) en lugar de simularla.
///
/// Por qué cinco productos y no dos: tres de ellos tienen una config INCOMPLETA pero distinta
/// (sin escalones, sin tamaño de paquete, con escalones pero desactivada). Una puerta que solo
/// mirara `WholesaleEnabled`, o solo la existencia de escalones, los dejaría pasar; con los tres
/// casos el test distingue "la regla completa" de "media regla".
///
/// El montaje es anónimo a propósito (sin claims, sin tenant): el catálogo público se sirve sin
/// sesión, y es justo el escenario donde los filtros globales por tenant de `Product` y de
/// `ProductWholesaleTier` ocultarían TODAS las filas si el bypass no alcanzara a los escalones.
/// </summary>
public class PublicCatalogWholesaleGateTests
{
    private const string WithConfigName = "Camisa";
    private const string WithoutConfigName = "Pantalon";
    private const string EnabledWithoutTiersName = "Gorra";
    private const string WithoutPackSizeName = "Bufanda";
    private const string TiersButDisabledName = "Falda";

    /// <summary>
    /// Catálogo sembrado. Cada producto con config mayorista lleva escalones de 1 y 3 paquetes.
    /// <paramref name="priceMode"/> null = la tienda NO tiene fila de configuración.
    /// </summary>
    private static (ApplicationDbContext Context, ProductRepository Repository, Guid StoreId)
        CreateCatalog(CatalogPriceMode? priceMode)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(false);
        httpContextMock.Setup(x => x.TenantId).Returns(string.Empty);
        httpContextMock.Setup(x => x.UserExternalId).Returns(string.Empty);
        httpContextMock.Setup(x => x.StoreId).Returns(string.Empty);

        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);

        Guid storeId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();

        var category = ProductCategory.Create(storeId, "Ropa", 1, tenantId, slug: "ropa");
        context.Set<ProductCategory>().Add(category);

        if (priceMode.HasValue)
        {
            StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), storeId, tenantId);
            settings.PriceMode = priceMode.Value;
            context.Set<StoreCatalogSettings>().Add(settings);
        }

        AddProduct(context, category, tenantId, WithConfigName, wholesaleEnabled: true, packSize: 12,
            tiers: [(1, 50m), (3, 45m)]);
        AddProduct(context, category, tenantId, WithoutConfigName, wholesaleEnabled: false, packSize: 0,
            tiers: []);
        AddProduct(context, category, tenantId, EnabledWithoutTiersName, wholesaleEnabled: true, packSize: 12,
            tiers: []);
        AddProduct(context, category, tenantId, WithoutPackSizeName, wholesaleEnabled: true, packSize: 0,
            tiers: [(1, 30m)]);
        AddProduct(context, category, tenantId, TiersButDisabledName, wholesaleEnabled: false, packSize: 12,
            tiers: [(2, 70m)]);

        context.SaveChanges();

        return (context, new ProductRepository(context), storeId);
    }

    private static void AddProduct(ApplicationDbContext context, ProductCategory category, Guid tenantId,
        string name, bool wholesaleEnabled, int packSize, (int MinPacks, decimal PricePerUnit)[] tiers)
    {
        var product = Product.Create(name, category.Id, 100m, 1, true, true, "B-1", tenantId);
        product.WholesaleEnabled = wholesaleEnabled;
        product.WholesalePackSize = packSize;
        foreach ((int minPacks, decimal pricePerUnit) in tiers)
            product.WholesaleTiers.Add(
                ProductWholesaleTier.Create(product.Id, minPacks, pricePerUnit, Currency.CUP, tenantId));

        context.Set<Product>().Add(product);
    }

    private static string[] Names(IEnumerable<Product> products)
        => products.Select(product => product.Name).ToArray();

    /// <summary>Control positivo del modo unidad: nadie desaparece. Sin esto, los tests de abajo
    /// también pasarían con una puerta que ocultara todo.</summary>
    [Fact]
    public async Task GetPublishedPageAsync_WithUnitMode_ShouldPublishEveryProduct()
    {
        var (context, repository, storeId) = CreateCatalog(CatalogPriceMode.Unit);

        IList<Product> page = await repository.GetPublishedPageAsync(storeId, null, null, 0, 24);

        Names(page).Should().BeEquivalentTo(
        [
            WithConfigName, WithoutConfigName, EnabledWithoutTiersName, WithoutPackSizeName, TiersButDisabledName,
        ]);
        (await repository.CountPublishedAsync(storeId, null, null)).Should().Be(5);

        context.Dispose();
    }

    [Fact]
    public async Task GetPublishedPageAsync_WithWholesaleMode_ShouldHideProductsWithoutAValidConfig()
    {
        var (context, repository, storeId) = CreateCatalog(CatalogPriceMode.Wholesale);

        IList<Product> page = await repository.GetPublishedPageAsync(storeId, null, null, 0, 24);

        Names(page).Should().Equal(WithConfigName);

        context.Dispose();
    }

    /// <summary>El conteo es el que pagina la vista: si no aplicara la misma puerta, el listado
    /// diría "5 productos" y mostraría uno.</summary>
    [Fact]
    public async Task CountPublishedAsync_WithWholesaleMode_ShouldCountOnlyProductsWithAValidConfig()
    {
        var (context, repository, storeId) = CreateCatalog(CatalogPriceMode.Wholesale);

        (await repository.CountPublishedAsync(storeId, null, null)).Should().Be(1);

        context.Dispose();
    }

    /// <summary>Los conteos por categoría salen del `GROUP BY`: son los números de la cabecera y
    /// tienen que hablar del mismo universo que el listado.</summary>
    [Fact]
    public async Task GetPublishedCategoryCountsAsync_WithWholesaleMode_ShouldCountOnlyValidProducts()
    {
        var (context, repository, storeId) = CreateCatalog(CatalogPriceMode.Wholesale);

        IList<PublishedCategoryCount> counts = await repository.GetPublishedCategoryCountsAsync(storeId);

        counts.Should().ContainSingle().Which.ProductsCount.Should().Be(1);
        counts.Single().Slug.Should().Be("ropa");

        context.Dispose();
    }

    /// <summary>La búsqueda se filtra sobre el mismo universo publicado: un producto oculto no
    /// reaparece por escribir su nombre.</summary>
    [Fact]
    public async Task GetPublishedPageAsync_WithWholesaleMode_ShouldFilterTheSearchInsideTheValidProducts()
    {
        var (context, repository, storeId) = CreateCatalog(CatalogPriceMode.Wholesale);

        (await repository.GetPublishedPageAsync(storeId, null, "camisa", 0, 24)).Should().ContainSingle();
        (await repository.GetPublishedPageAsync(storeId, null, "gorra", 0, 24)).Should().BeEmpty();
        (await repository.CountPublishedAsync(storeId, null, "gorra")).Should().Be(0);

        context.Dispose();
    }

    [Fact]
    public async Task GetPublishedByIdAsync_WithWholesaleMode_ShouldNotPublishAProductWithoutAValidConfig()
    {
        var (context, repository, storeId) = CreateCatalog(CatalogPriceMode.Wholesale);

        var hidden = await context.Set<Product>()
            .IgnoreQueryFilters()
            .SingleAsync(product => product.Name == EnabledWithoutTiersName);
        var published = await context.Set<Product>()
            .IgnoreQueryFilters()
            .SingleAsync(product => product.Name == WithConfigName);

        (await repository.GetPublishedByIdAsync(storeId, hidden.Id)).Should().BeNull();

        var found = await repository.GetPublishedByIdAsync(storeId, published.Id);
        found.Should().NotBeNull();
        found!.WholesaleTiers.Should().HaveCount(2);

        context.Dispose();
    }

    /// <summary>La tienda sin fila de configuración no tiene opinión: se publica por unidad, que es
    /// lo que el catálogo hacía antes de que el modo existiera.</summary>
    [Fact]
    public async Task GetPublicPriceModeAsync_WithoutASettingsRow_ShouldBeUnit()
    {
        var (context, repository, storeId) = CreateCatalog(priceMode: null);

        (await repository.GetPublicPriceModeAsync(storeId)).Should().Be(CatalogPriceMode.Unit);

        // Y el catálogo se comporta como unidad: nadie desaparece.
        (await repository.CountPublishedAsync(storeId, null, null)).Should().Be(5);

        context.Dispose();
    }

    [Fact]
    public async Task GetPublicPriceModeAsync_WithAWholesaleSettingsRow_ShouldBeWholesale()
    {
        var (context, repository, storeId) = CreateCatalog(CatalogPriceMode.Wholesale);

        (await repository.GetPublicPriceModeAsync(storeId)).Should().Be(CatalogPriceMode.Wholesale);

        context.Dispose();
    }
}
