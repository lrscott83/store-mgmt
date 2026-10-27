using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.StoreSync.Queries.DownloadStoreSyncFile;
using Application.UnitOfWorks;
using Domain.Entities.StoreSyncFiles;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreSync.Queries;

/// <summary>
/// Descargar un fichero es servir bytes y dejar constancia, sin bloquear:
///
///   * La comprobación de ámbito se hace sobre la TIENDA DEL FICHERO (S5/S6): un fichero de otra
///     tienda responde 404 igual que uno inexistente, nunca 403.
///   * La marca es POR USUARIO y ÚNICA (S4). Si ya existe, no se duplica — pero la descarga se
///     sirve igual y el contador sube otra vez: la marca informa, no bloquea.
///   * Las dos escrituras —marca y contador— van en UNA transacción: una descarga no puede dejar el
///     contador sin la marca ni al revés.
///   * Sin blob no hay descarga: se responde 404 antes de escribir nada.
///
/// Y el detalle que sostiene todos los demás: el stream se entrega ABIERTO a la respuesta, y si la
/// petición falla antes de entregarlo se cierra aquí — o el descriptor queda abierto hasta el GC.
/// </summary>
public class DownloadStoreSyncFileQueryHandlerTests
{
    private const string StorageKey = "tenant/store/file.zip";

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreSyncFileRepository> _fileRepository = new();
    private readonly Mock<IStoreSyncFileStorage> _storage = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<IDbContextTransaction> _transaction = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _userId = Guid.NewGuid();
    private readonly Store _store;
    private readonly Guid _storeId;

    private Stream _blob = new MemoryStream([1, 2, 3, 4]);

    public DownloadStoreSyncFileQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns((string name) => new LocalizedString(name, name));

        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _store = Store.Create("Tienda Centro", Guid.NewGuid(), true, _tenantId);
        _storeId = _store.Id;

        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(_userId.ToString());
        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);

        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _unitOfWork
            .Setup(x => x.BeginTransactionAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(_transaction.Object);

        _storeRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync([_store]);
        _storeRepository
            .Setup(x => x.GetStoreByIdAsync(_storeId))
            .ReturnsAsync(_store);

        _storage
            .Setup(x => x.BelongsToStore(StorageKey, _tenantId, _storeId))
            .Returns(true);
        _storage
            .Setup(x => x.OpenAsync(StorageKey, It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => _blob);

        _fileRepository
            .Setup(x => x.GetDownloadAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((StoreSyncFileDownload?)null);
        _fileRepository
            .Setup(x => x.IncrementDownloadCountAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _fileRepository
            .Setup(x => x.AddDownloadAsync(It.IsAny<StoreSyncFileDownload>()))
            .Returns(Task.CompletedTask);
    }

    private DownloadStoreSyncFileQueryHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _fileRepository.Object,
        _storage.Object,
        _storeRepository.Object,
        _localizer.Object);

    private StoreSyncFile GivenFile(
        Guid? storeId = null,
        string fileName = "respaldo-centro.zip",
        string contentType = "application/zip",
        long sizeBytes = 4,
        string storageKey = StorageKey)
    {
        Guid store = storeId ?? _storeId;
        StoreSyncFile file = StoreSyncFile.Create(
            store, _tenantId, fileName, contentType, sizeBytes, storageKey, _userId, "Ana María Pérez", "Tienda Centro");

        _fileRepository
            .Setup(x => x.GetActiveByIdAsync(file.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(file);

        return file;
    }

    private void GivenStoreUser(string storeId)
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);
        _httpContextService.Setup(x => x.StoreId).Returns(storeId);
    }

    #region Happy path

    /// <summary>
    /// El contenido se sirve con el nombre y el tipo guardados en la fila (S13) y se devuelve el
    /// stream ABIERTO: cerrarlo es responsabilidad de la respuesta.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnExistingFile_ShouldServeTheStoredContentAndMetadata()
    {
        StoreSyncFile file = GivenFile(sizeBytes: 4);

        var result = await Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.FileName.Should().Be("respaldo-centro.zip");
        result.Data.ContentType.Should().Be("application/zip");
        result.Data.Length.Should().Be(4);

        using var copy = new MemoryStream();
        await result.Data.Content.CopyToAsync(copy);
        copy.ToArray().Should().Equal(1, 2, 3, 4);
        result.Data.Content.CanRead.Should().BeTrue("el stream se entrega abierto a la respuesta");
    }

    /// <summary>
    /// La primera descarga deja la marca DEL USUARIO y sube el contador, todo dentro de la misma
    /// transacción y confirmado al final.
    /// </summary>
    [Fact]
    public async Task Handle_OnTheFirstDownload_ShouldRecordTheMarkAndIncrementTheCounterInOneTransaction()
    {
        StoreSyncFile file = GivenFile();

        await Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        _unitOfWork.Verify(x => x.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _fileRepository.Verify(x => x.AddDownloadAsync(
            It.Is<StoreSyncFileDownload>(download =>
                download.StoreSyncFileId == file.Id
                && download.UserId == _userId
                && download.TenantId == _tenantId)), Times.Once);
        _fileRepository.Verify(x => x.IncrementDownloadCountAsync(
            file.Id, _userId, It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        _transaction.Verify(x => x.CommitAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// La marca es ÚNICA por (fichero, usuario): una segunda descarga no inserta otra. Pero SÍ se
    /// sirve otra vez y el contador sube otra vez — es informativa, no bloqueante (S4).
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheCallerAlreadyDownloadedIt_ShouldNotDuplicateTheMarkButShouldServeAndCountAgain()
    {
        StoreSyncFile file = GivenFile();
        _fileRepository
            .Setup(x => x.GetDownloadAsync(file.Id, _userId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(StoreSyncFileDownload.Create(file.Id, _userId, _tenantId, DateTimeOffset.UtcNow.AddDays(-1)));

        var result = await Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _fileRepository.Verify(x => x.AddDownloadAsync(It.IsAny<StoreSyncFileDownload>()), Times.Never);
        _fileRepository.Verify(x => x.IncrementDownloadCountAsync(
            file.Id, _userId, It.IsAny<CancellationToken>()), Times.Once);
        _transaction.Verify(x => x.CommitAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion

    #region Scope (S5, S6)

    /// <summary>
    /// Un fichero inexistente y uno de otra tienda responden EXACTAMENTE igual —404 con el mismo
    /// mensaje— para no revelar qué ids existen.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheFileDoesNotExist_ShouldReportNotFoundWithoutOpeningAnything()
    {
        _fileRepository
            .Setup(x => x.GetActiveByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((StoreSyncFile?)null);

        Func<Task> act = () => Handler().Handle(new DownloadStoreSyncFileQuery(Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        exception.Which.Message.Should().Be("StoreSyncFileNotFound");
        _storage.Verify(x => x.OpenAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// El ámbito se comprueba sobre la TIENDA DEL FICHERO, no sobre la seleccionada: un Owner que ya
    /// no tiene esa tienda recibe 404 y no se escribe ninguna marca.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheFilesStoreIsOutsideTheCallersScope_ShouldReportNotFoundAndWriteNothing()
    {
        _storeRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync([]);
        StoreSyncFile file = GivenFile();

        Func<Task> act = () => Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        exception.Which.Message.Should().Be("StoreSyncFileNotFound");
        _storage.Verify(x => x.OpenAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _fileRepository.Verify(x => x.AddDownloadAsync(It.IsAny<StoreSyncFileDownload>()), Times.Never);
        _fileRepository.Verify(x => x.IncrementDownloadCountAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>Un StoreUser no puede descargar el fichero de otra tienda, aunque conozca su id.</summary>
    [Fact]
    public async Task Handle_WhenAStoreUserAsksForAnotherStoresFile_ShouldReportNotFound()
    {
        GivenStoreUser(_storeId.ToString());
        Store other = Store.Create("Tienda Norte", Guid.NewGuid(), true, _tenantId);
        _storeRepository.Setup(x => x.GetStoreByIdAsync(other.Id)).ReturnsAsync(other);
        _storage.Setup(x => x.BelongsToStore(StorageKey, _tenantId, other.Id)).Returns(true);
        StoreSyncFile file = GivenFile(storeId: other.Id);

        Func<Task> act = () => Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _storage.Verify(x => x.OpenAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion

    #region Blob guards

    /// <summary>
    /// Una fila sin blob no es un 500: no hay nada que reintentar, así que para el cliente es un
    /// fichero que no está y no se registra ninguna descarga.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheBlobIsMissing_ShouldReportNotFoundWithoutRecordingTheDownload()
    {
        StoreSyncFile file = GivenFile();
        _storage
            .Setup(x => x.OpenAsync(StorageKey, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Stream?)null);

        Func<Task> act = () => Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _fileRepository.Verify(x => x.AddDownloadAsync(It.IsAny<StoreSyncFileDownload>()), Times.Never);
        _fileRepository.Verify(x => x.IncrementDownloadCountAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Defensa en profundidad: la clave persistida tiene que decir la MISMA tienda que la fila. Si
    /// no, no se abre el archivo aunque la ruta exista.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStorageKeyDoesNotBelongToTheFilesStore_ShouldReportNotFoundWithoutOpening()
    {
        StoreSyncFile file = GivenFile();
        _storage
            .Setup(x => x.BelongsToStore(StorageKey, _tenantId, _storeId))
            .Returns(false);

        Func<Task> act = () => Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _storage.Verify(x => x.OpenAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>La pertenencia se comprueba con el tenant y la tienda DE LA FILA, no con el claim.</summary>
    [Fact]
    public async Task Handle_ShouldValidateTheStorageKeyAgainstTheFilesTenantAndStore()
    {
        StoreSyncFile file = GivenFile();

        await Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        _storage.Verify(x => x.BelongsToStore(StorageKey, file.TenantId, file.StoreId), Times.Once);
    }

    #endregion

    #region Stream lifetime

    /// <summary>
    /// Si la transacción falla antes de entregar el stream, el handler lo cierra: dejarlo abierto
    /// mantendría el descriptor de archivo vivo hasta que pase el GC.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheTransactionFails_ShouldDisposeTheStreamAndRethrow()
    {
        StoreSyncFile file = GivenFile();
        _transaction
            .Setup(x => x.CommitAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("commit con resultado desconocido"));

        Func<Task> act = () => Handler().Handle(new DownloadStoreSyncFileQuery(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<InvalidOperationException>();
        exception.Which.Message.Should().Be("commit con resultado desconocido");
        _blob.CanRead.Should().BeFalse("el stream no llegó a la respuesta");
    }

    #endregion
}
