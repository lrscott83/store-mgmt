using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.WebCatalog.Public.Queries.GetCatalogMedia;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Public.Queries;

/// <summary>
/// Media público (anónimo): sirve una imagen SOLO si la clave pertenece a la tienda del slug. Un
/// 404 uniforme cubre los tres casos —tienda sin catálogo, clave ajena y archivo inexistente— sin
/// distinguir entre ellos.
/// </summary>
public class GetCatalogMediaQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<ICatalogImageStorage> _storage = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Store _store;
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetCatalogMediaQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns((string name) => new LocalizedString(name, name));
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) => new LocalizedString(name, name));

        _store = Store.Create("Tienda Pública", Guid.NewGuid(), true, _tenantId);
        _store.CatalogSlug = "tienda-publica";

        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>()))
            .ReturnsAsync(_store);
    }

    private GetCatalogMediaQueryHandler Handler() => new(
        _storeRepository.Object,
        _storage.Object,
        _localizer.Object);

    [Fact]
    public async Task Handle_WithAKeyOfTheStore_ShouldReturnTheFile()
    {
        _storage.Setup(x => x.BelongsToStore(It.IsAny<string>(), _tenantId, _store.Id)).Returns(true);
        _storage
            .Setup(x => x.OpenAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CatalogStoredImage(new MemoryStream(new byte[] { 1, 2, 3 }), "image/png", 3));

        var result = await Handler().Handle(
            new GetCatalogMediaQuery("tienda-publica", $"{_tenantId:N}/{_store.Id:N}/catalog/x/a.png"), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.ContentType.Should().Be("image/png");
    }

    /// <summary>Una clave que no pertenece a la tienda es un 404, no un 500.</summary>
    [Fact]
    public async Task Handle_WithAKeyOfAnotherStore_ShouldReportNotFound()
    {
        _storage.Setup(x => x.BelongsToStore(It.IsAny<string>(), _tenantId, _store.Id)).Returns(false);

        Func<Task> act = () => Handler().Handle(
            new GetCatalogMediaQuery("tienda-publica", "otro/tenant/otra-tienda/x.png"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _storage.Verify(x => x.OpenAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithAnUnknownStore_ShouldReportNotFound()
    {
        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>()))
            .ReturnsAsync((Store?)null);

        Func<Task> act = () => Handler().Handle(new GetCatalogMediaQuery("no-existe", "x/y/z.png"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_WhenTheFileIsMissing_ShouldReportNotFound()
    {
        _storage.Setup(x => x.BelongsToStore(It.IsAny<string>(), _tenantId, _store.Id)).Returns(true);
        _storage
            .Setup(x => x.OpenAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((CatalogStoredImage?)null);

        Func<Task> act = () => Handler().Handle(
            new GetCatalogMediaQuery("tienda-publica", "tenant/store/catalog/carousel/gone.png"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }
}
