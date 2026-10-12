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
/// Lectura de UNA imagen por id acotada a la TIENDA del contexto: la que usa el borrado.
///
/// El criterio (id AND StoreId) viaja en la CONSULTA, no en una comprobación posterior. Importa porque
/// el filtro global de <c>StoreCatalogImage</c> solo acota por TENANT: sin el <c>StoreId</c> en la
/// condición, un dueño podría resolver la imagen de OTRA tienda del mismo tenant.
///
/// Montaje: un <c>ApplicationDbContext</c> REAL sobre <c>InMemory</c> con la sesión simulada (mismo
/// patrón que <c>StoreCatalogImageRepositoryTenantFilterTests</c>), para apoyarse en el filtro global
/// del modelo —el mismo objeto que PostgreSQL evalúa— y en la condición de la consulta.
/// </summary>
public class StoreCatalogImageRepositoryScopingTests
{
    private static (ApplicationDbContext Context, StoreCatalogImageRepository Repository) CreateContext(
        Guid storeId, Guid tenantId, params StoreCatalogImage[] seeded)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(false);
        httpContextMock.Setup(x => x.TenantId).Returns(tenantId.ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.StoreId).Returns(storeId.ToString());

        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);
        context.Set<StoreCatalogImage>().AddRange(seeded);
        context.SaveChanges();

        return (context, new StoreCatalogImageRepository(context));
    }

    private static StoreCatalogImage Image(Guid storeId, Guid tenantId, int orderIndex)
        => StoreCatalogImage.Create(storeId, tenantId, StoreCatalogImageKind.Carousel,
            $"{tenantId:N}/{storeId:N}/catalog/carousel/{Guid.NewGuid():N}.png", orderIndex, null);

    [Fact]
    public async Task GetByIdAndStoreIdAsync_WithTheRowInTheStore_ShouldReturnIt()
    {
        Guid storeId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();
        StoreCatalogImage mine = Image(storeId, tenantId, 0);
        var (context, repository) = CreateContext(storeId, tenantId, mine);

        StoreCatalogImage? found = await repository.GetByIdAndStoreIdAsync(mine.Id, storeId, CancellationToken.None);

        found.Should().NotBeNull();
        found!.Id.Should().Be(mine.Id);

        context.Dispose();
    }

    /// <summary>
    /// Otra tienda del MISMO tenant: el filtro global la deja pasar, así que lo único que la excluye es
    /// el <c>StoreId</c> de la consulta. Es el guardián de que el borrado no toque la tienda de otro.
    /// </summary>
    [Fact]
    public async Task GetByIdAndStoreIdAsync_ForAnotherStoreOfTheSameTenant_ShouldReturnNull()
    {
        Guid storeId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();
        StoreCatalogImage foreign = Image(Guid.NewGuid(), tenantId, 0);
        var (context, repository) = CreateContext(storeId, tenantId, Image(storeId, tenantId, 0), foreign);

        StoreCatalogImage? found = await repository.GetByIdAndStoreIdAsync(foreign.Id, storeId, CancellationToken.None);

        found.Should().BeNull();

        context.Dispose();
    }

    [Fact]
    public async Task GetByIdAndStoreIdAsync_WithAnUnknownId_ShouldReturnNull()
    {
        Guid storeId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();
        var (context, repository) = CreateContext(storeId, tenantId, Image(storeId, tenantId, 0));

        StoreCatalogImage? found = await repository.GetByIdAndStoreIdAsync(Guid.NewGuid(), storeId, CancellationToken.None);

        found.Should().BeNull();

        context.Dispose();
    }
}
