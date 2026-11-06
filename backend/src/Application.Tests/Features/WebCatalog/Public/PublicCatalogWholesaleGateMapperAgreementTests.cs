using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Public;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;
using Application.Abstractions.HttpContext;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// R3-two-gate-copies: "config mayorista válida" se decide DOS veces —en el predicado SQL de
/// <c>ProductRepository.ApplyWholesaleGate</c> y en <c>WholesalePricing.HasConfig</c>, que usa el
/// mapper— y ninguna prueba obligaba a las dos expresiones a coincidir sobre el MISMO producto.
///
/// La consecuencia de que discrepen no es cosmética: si el SQL publicara un producto que el mapper
/// considera sin config, el catálogo serviría una tarjeta sin precio de paquete (un producto que no
/// se puede comprar); si el SQL ocultara uno que el mapper considera válido, el modo mayorista
/// escondería productos vendibles. Por eso aquí se afirma la equivalencia en las dos direcciones,
/// sobre una matriz que ataca la regla por partes: desactivada con escalones, activada sin tamaño de
/// paquete, activada con paquete y sin escalones, y la única combinación válida.
///
/// Es un guardián de regresión, no un test escrito tras un RED: el comportamiento ya era correcto y
/// lo que faltaba era la prueba que impide que las dos copias se separen en el futuro.
/// </summary>
public class PublicCatalogWholesaleGateMapperAgreementTests
{
    private const string ValidConfigName = "Camisa";
    private const string DisabledWithTiersName = "Pantalon";
    private const string WithoutPackSizeName = "Gorra";
    private const string WithoutTiersName = "Bufanda";

    /// <summary>
    /// Catálogo sembrado en modo mayorista: la matriz completa de la regla, un producto por caso.
    /// Se siembra de forma anónima (sin claims ni tenant), igual que la visita real al catálogo.
    /// </summary>
    private static (ApplicationDbContext Context, ProductRepository Repository, Guid StoreId)
        CreateCatalog()
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

        StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), storeId, tenantId);
        settings.PriceMode = CatalogPriceMode.Wholesale;
        context.Set<StoreCatalogSettings>().Add(settings);

        AddProduct(context, category, tenantId, ValidConfigName,
            wholesaleEnabled: true, packSize: 12, tiers: [(1, 50m)]);
        AddProduct(context, category, tenantId, DisabledWithTiersName,
            wholesaleEnabled: false, packSize: 12, tiers: [(1, 40m)]);
        AddProduct(context, category, tenantId, WithoutPackSizeName,
            wholesaleEnabled: true, packSize: 0, tiers: [(1, 30m)]);
        AddProduct(context, category, tenantId, WithoutTiersName,
            wholesaleEnabled: true, packSize: 12, tiers: []);

        context.SaveChanges();

        return (context, new ProductRepository(context), storeId);
    }

    private static void AddProduct(ApplicationDbContext context, ProductCategory category, Guid tenantId,
        string name, bool wholesaleEnabled, int packSize, (int MinPacks, decimal PricePerUnit)[] tiers)
    {
        var product = Product.Create(name, category.Id, 100m, 1, true, true, "B-1", tenantId);
        product.WholesaleEnabled = wholesaleEnabled;
        product.WholesalePackSize = packSize;
        product.WholesaleUnitLabel = "caja";
        foreach ((int minPacks, decimal pricePerUnit) in tiers)
            product.WholesaleTiers.Add(
                ProductWholesaleTier.Create(product.Id, minPacks, pricePerUnit, Currency.CUP, tenantId));

        context.Set<Product>().Add(product);
    }

    /// <summary>
    /// Dirección 1: TODO lo que la puerta publica se mapea con sus números mayoristas. Un producto
    /// publicado sin precio de paquete es una tarjeta muerta en el catálogo.
    /// </summary>
    [Fact]
    public async Task EveryPublishedProduct_ShouldBeMappedWithItsWholesaleNumbers()
    {
        var (context, repository, storeId) = CreateCatalog();

        IList<Product> page = await repository.GetPublishedPageAsync(storeId, null, null, 0, 50);
        page.Select(product => product.Name).Should().Equal(ValidConfigName);

        List<PublicCatalogProductDto> items = page
            .Select(product => PublicCatalogProductMapper.ToDto(
                product, "ropa", CatalogPriceMode.Wholesale))
            .ToList();

        items.Should().OnlyContain(item => item.WholesaleMinPacks != null
            && item.WholesaleUnitPrice != null
            && item.WholesalePackPrice != null
            && item.WholesaleTiers.Count > 0);

        context.Dispose();
    }

    /// <summary>
    /// Dirección 2, la que de verdad ata las dos expresiones: para CADA producto de la matriz, la
    /// decisión del SQL (¿está publicado?) y la decisión del mapper (¿tiene configuración válida?)
    /// tienen que coincidir. Si una copia cambia sola, este test cae nombrando el producto.
    /// </summary>
    [Fact]
    public async Task TheSqlGateAndTheMapper_ShouldAgreeOnEveryProductOfTheMatrix()
    {
        var (context, repository, storeId) = CreateCatalog();

        IList<Product> page = await repository.GetPublishedPageAsync(storeId, null, null, 0, 50);
        HashSet<string> publishedNames = page.Select(product => product.Name).ToHashSet();
        publishedNames.Should().Equal(ValidConfigName);

        List<Product> matrix = await context.Set<Product>()
            .IgnoreQueryFilters()
            .Include(product => product.WholesaleTiers)
            .ToListAsync();

        matrix.Should().HaveCount(4, "la matriz es un producto por cada forma de romper la regla");

        foreach (Product product in matrix)
        {
            PublicCatalogProductDto dto = PublicCatalogProductMapper.ToDto(
                product, "ropa", CatalogPriceMode.Wholesale);

            bool mapperConsidersItValid = dto.WholesaleEnabled
                && dto.WholesaleMinPacks.HasValue
                && dto.WholesaleTiers.Count > 0;

            mapperConsidersItValid.Should().Be(
                publishedNames.Contains(product.Name),
                "la puerta SQL y `WholesalePricing.HasConfig` son dos expresiones de la misma regla"
                + " y no pueden discrepar en '{0}'", product.Name);
        }

        context.Dispose();
    }

    /// <summary>
    /// El caso que motiva todo lo anterior, por nombre: los tres productos con config incompleta
    /// NO se publican. Sin esto, la equivalencia de arriba se cumpliría publicando todo y mapeando
    /// todo "válido".
    /// </summary>
    [Theory]
    [InlineData(DisabledWithTiersName)]
    [InlineData(WithoutPackSizeName)]
    [InlineData(WithoutTiersName)]
    public async Task AProductWithoutAValidConfig_ShouldNotBePublishedAtAll(string name)
    {
        var (context, repository, storeId) = CreateCatalog();

        IList<Product> page = await repository.GetPublishedPageAsync(storeId, null, null, 0, 50);

        page.Select(product => product.Name).Should().NotContain(name);

        context.Dispose();
    }
}
