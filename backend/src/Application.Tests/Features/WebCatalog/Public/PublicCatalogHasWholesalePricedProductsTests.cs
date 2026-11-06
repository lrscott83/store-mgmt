using Application.Abstractions.HttpContext;
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

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// S7: <c>HasWholesalePricedProductsAsync</c> es la puerta que autoriza guardar el catálogo en modo
/// mayorista, y mide los productos de la TIENDA —activos o no, en venta o no—, NO el universo
/// publicado. Esa diferencia es deliberada y está en las palabras del spec ("si el owner configura
/// mal y no hay productos ... es su problema"): el servidor solo se niega a encender un modo que no
/// tendría un solo producto con precio mayorista; después, un sync que deja el catálogo vacío es una
/// configuración del dueño y la app solo avisa.
///
/// Un test que solo mirara productos activos pasaría con la implementación equivocada (la que filtra
/// por el universo publicado) y no fijaría nada. Por eso el caso central es el producto con config
/// válida que NO se publica: la puerta responde `true` y el catálogo sigue vacío, a la vez.
///
/// Estos tests también fijan que la puerta usa la regla COMPLETA (activado + paquete positivo + al
/// menos un escalón) y no una parte: los tres modos de romperla responden `false`.
/// </summary>
public class PublicCatalogHasWholesalePricedProductsTests
{
    private const string ProductName = "Camisa";

    private static (ApplicationDbContext Context, ProductRepository Repository, Guid StoreId)
        CreateStore(bool wholesaleEnabled, int packSize, int tiersCount, bool isActive, bool availableToSale)
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

        var product = Product.Create(
            ProductName, category.Id, 100m, 1, availableToSale, true, "B-1", tenantId);
        product.IsActive = isActive;
        product.WholesaleEnabled = wholesaleEnabled;
        product.WholesalePackSize = packSize;
        for (int index = 0; index < tiersCount; index++)
            product.WholesaleTiers.Add(
                ProductWholesaleTier.Create(product.Id, index + 1, 50m, Currency.CUP, tenantId));

        context.Set<Product>().Add(product);

        // La tienda ya está publicando en mayorista: la puerta NO depende del modo guardado, mide
        // los datos del catálogo. Se siembra así a propósito para que el test no pueda pasar por
        // "no hay fila de configuración".
        StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), storeId, tenantId);
        settings.PriceMode = CatalogPriceMode.Wholesale;
        context.Set<StoreCatalogSettings>().Add(settings);

        context.SaveChanges();

        return (context, new ProductRepository(context), storeId);
    }

    /// <summary>
    /// El caso que el revisor señaló: un producto con config válida que NO se publica —porque está
    /// inactivo— sigue contando para la puerta. El mismo montaje prueba las dos caras: `true` en la
    /// puerta y catálogo público vacío, que es exactamente el estado que S7 deja en manos del dueño.
    /// </summary>
    [Fact]
    public async Task WithOnlyAnInactiveProductWithAValidConfig_ShouldBeTrue()
    {
        var (context, repository, storeId) = CreateStore(
            wholesaleEnabled: true, packSize: 12, tiersCount: 1, isActive: false, availableToSale: true);

        (await repository.HasWholesalePricedProductsAsync(storeId)).Should().BeTrue();

        // Y el catálogo publicado está vacío: la puerta mide la TIENDA, no el universo publicado.
        (await repository.GetPublishedPageAsync(storeId, null, null, 0, 50)).Should().BeEmpty();

        context.Dispose();
    }

    /// <summary>Segunda forma de no publicarse: activo pero fuera de venta. También cuenta.</summary>
    [Fact]
    public async Task WithOnlyAProductNotAvailableToSaleAndAValidConfig_ShouldBeTrue()
    {
        var (context, repository, storeId) = CreateStore(
            wholesaleEnabled: true, packSize: 12, tiersCount: 1, isActive: true, availableToSale: false);

        (await repository.HasWholesalePricedProductsAsync(storeId)).Should().BeTrue();

        context.Dispose();
    }

    /// <summary>Control positivo: sí, este montaje puede responder `true`. Sin él, los `false` de
    /// abajo pasarían con una puerta que siempre dijera que no.</summary>
    [Fact]
    public async Task WithAPublishedProductWithAValidConfig_ShouldBeTrue()
    {
        var (context, repository, storeId) = CreateStore(
            wholesaleEnabled: true, packSize: 12, tiersCount: 1, isActive: true, availableToSale: true);

        (await repository.HasWholesalePricedProductsAsync(storeId)).Should().BeTrue();

        context.Dispose();
    }

    /// <summary>
    /// Y la regla completa, no media regla: desactivada con escalones, activada sin tamaño de
    /// paquete y activada sin escalones no autorizan el modo — son justo los tres casos que la
    /// puerta de publicación oculta, así que la puerta de S7 no puede contarlos.
    /// </summary>
    [Theory]
    [InlineData(false, 12, 1)]  // escalones presentes, venta mayorista apagada
    [InlineData(true, 0, 1)]    // sin tamaño de paquete: un paquete no tendría precio
    [InlineData(true, 12, 0)]   // activada pero sin un solo escalón
    public async Task WithOnlyAProductWhoseConfigIsInvalid_ShouldBeFalse(
        bool wholesaleEnabled, int packSize, int tiersCount)
    {
        var (context, repository, storeId) = CreateStore(
            wholesaleEnabled, packSize, tiersCount, isActive: true, availableToSale: true);

        (await repository.HasWholesalePricedProductsAsync(storeId)).Should().BeFalse();

        context.Dispose();
    }
}
