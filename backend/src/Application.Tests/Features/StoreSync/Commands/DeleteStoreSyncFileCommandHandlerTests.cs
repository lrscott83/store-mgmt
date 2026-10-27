using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.StoreSync.Commands.DeleteStoreSyncFile;
using Application.UnitOfWorks;
using Domain.Entities.StoreSyncFiles;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreSync.Commands;

/// <summary>
/// Borrar un fichero es una baja LÓGICA de la fila y FÍSICA del blob, y el orden importa:
///
///   1. Primero la fila. Si la fila no se da de baja, el blob se conserva: sigue siendo el contenido
///      de un fichero que el repositorio todavía muestra.
///   2. Después el blob. Si su borrado falla, la baja ya está hecha y lo que queda es un huérfano
///      registrado como deuda de disco — no un 500 sobre algo que el usuario ya no ve.
///   3. El ámbito se comprueba antes de tocar nada: el fichero de otra tienda responde 404, nunca 403.
/// </summary>
public class DeleteStoreSyncFileCommandHandlerTests
{
    private const string StorageKey = "tenant/store/file.zip";

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreSyncFileRepository> _fileRepository = new();
    private readonly Mock<IStoreSyncFileStorage> _storage = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<ILogger<DeleteStoreSyncFileCommandHandler>> _logger = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _userId = Guid.NewGuid();
    private readonly Store _store;
    private readonly Guid _storeId;

    public DeleteStoreSyncFileCommandHandlerTests()
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

        _storeRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync([_store]);
        _storeRepository
            .Setup(x => x.GetStoreByIdAsync(_storeId))
            .ReturnsAsync(_store);

        _fileRepository
            .Setup(x => x.SoftDeleteAsync(It.IsAny<StoreSyncFile>()))
            .ReturnsAsync(true);

        _storage
            .Setup(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
    }

    private DeleteStoreSyncFileCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _fileRepository.Object,
        _storage.Object,
        _storeRepository.Object,
        _localizer.Object,
        _logger.Object);

    private StoreSyncFile GivenFile(Guid? storeId = null)
    {
        Guid store = storeId ?? _storeId;
        StoreSyncFile file = StoreSyncFile.Create(
            store, _tenantId, "respaldo.zip", "application/zip", 4096, StorageKey, _userId,
            "Ana María Pérez", "Tienda Centro");

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

    #region Happy path (S8)

    /// <summary>Borrar da de baja la FILA y borra el BLOB de esa fila, en ese orden.</summary>
    [Fact]
    public async Task Handle_WithAnOwnedFile_ShouldSoftDeleteTheRowAndDeleteTheBlob()
    {
        StoreSyncFile file = GivenFile();

        var result = await Handler().Handle(new DeleteStoreSyncFileCommand(file.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        // La baja es lógica y tiene que verse en la ENTIDAD: el helper genérico
        // `SoftDeleteAsync` no marca `IsActive` para `AuditableEntity<Guid>`, así que el handler
        // lo hace explícitamente. Sin esto el UPDATE reescribe `IsActive = true` y el fichero
        // sigue en la lista aunque la respuesta sea 200.
        file.IsActive.Should().BeFalse();
        _fileRepository.Verify(x => x.SoftDeleteAsync(file), Times.Once);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        _storage.Verify(x => x.DeleteAsync(StorageKey, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// El orden protege los datos: primero se da de baja la fila y solo después se borra el blob.
    /// Si el blob se borrara antes y la baja fallara, el fichero seguiría en la lista apuntando a
    /// un contenido que ya no existe.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldDeleteTheRowBeforeTheBlob()
    {
        StoreSyncFile file = GivenFile();
        var calls = new List<string>();

        _fileRepository
            .Setup(x => x.SoftDeleteAsync(file))
            .Callback(() => calls.Add("row"))
            .ReturnsAsync(true);
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Callback(() => calls.Add("save"))
            .ReturnsAsync(1);
        _storage
            .Setup(x => x.DeleteAsync(StorageKey, It.IsAny<CancellationToken>()))
            .Callback(() => calls.Add("blob"))
            .Returns(Task.CompletedTask);

        await Handler().Handle(new DeleteStoreSyncFileCommand(file.Id), CancellationToken.None);

        calls.Should().Equal("row", "save", "blob");
    }

    /// <summary>Un StoreUser puede borrar los ficheros de su tienda (S8).</summary>
    [Fact]
    public async Task Handle_WhenAStoreUserDeletesItsStoresFile_ShouldAcceptIt()
    {
        GivenStoreUser(_storeId.ToString());
        StoreSyncFile file = GivenFile();

        var result = await Handler().Handle(new DeleteStoreSyncFileCommand(file.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _fileRepository.Verify(x => x.SoftDeleteAsync(file), Times.Once);
    }

    #endregion

    #region Scope (S5, S8)

    /// <summary>Un id inexistente responde 404 y no toca ni la fila ni el disco.</summary>
    [Fact]
    public async Task Handle_WhenTheFileDoesNotExist_ShouldReportNotFoundWithoutDeletingAnything()
    {
        _fileRepository
            .Setup(x => x.GetActiveByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((StoreSyncFile?)null);

        Func<Task> act = () => Handler().Handle(new DeleteStoreSyncFileCommand(Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        exception.Which.Message.Should().Be("StoreSyncFileNotFound");
        _fileRepository.Verify(x => x.SoftDeleteAsync(It.IsAny<StoreSyncFile>()), Times.Never);
        _storage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// El fichero de una tienda que ya no es del Owner responde como inexistente: 404, y el blob NO
    /// se borra.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheFilesStoreIsOutsideTheCallersScope_ShouldReportNotFoundAndDeleteNothing()
    {
        _storeRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync([]);
        StoreSyncFile file = GivenFile();

        Func<Task> act = () => Handler().Handle(new DeleteStoreSyncFileCommand(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        exception.Which.Message.Should().Be("StoreSyncFileNotFound");
        _fileRepository.Verify(x => x.SoftDeleteAsync(It.IsAny<StoreSyncFile>()), Times.Never);
        _storage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>Y un StoreUser no puede borrar el fichero de otra tienda aunque conozca su id.</summary>
    [Fact]
    public async Task Handle_WhenAStoreUserDeletesAnotherStoresFile_ShouldReportNotFound()
    {
        GivenStoreUser(_storeId.ToString());
        Store other = Store.Create("Tienda Norte", Guid.NewGuid(), true, _tenantId);
        _storeRepository.Setup(x => x.GetStoreByIdAsync(other.Id)).ReturnsAsync(other);
        StoreSyncFile file = GivenFile(storeId: other.Id);

        Func<Task> act = () => Handler().Handle(new DeleteStoreSyncFileCommand(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _storage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion

    #region Failure handling

    /// <summary>
    /// Si la baja de la fila falla, el blob se CONSERVA: sigue siendo el contenido de un fichero que
    /// el repositorio todavía muestra. Y el cliente recibe el 500 localizado, no el texto de EF.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheRowDeletionFails_ShouldKeepTheBlobAndReportServerError()
    {
        StoreSyncFile file = GivenFile();
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("No se pudo dar de baja."));

        Func<Task> act = () => Handler().Handle(new DeleteStoreSyncFileCommand(file.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        exception.Which.Message.Should().Be("StoreSyncFileDeleteFailed");
        _storage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Si ya se dio de baja la fila y falla el borrado del blob, el borrado NO se convierte en un
    /// error: el fichero ya no se lista y lo que queda es deuda de disco registrada.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheBlobDeletionFails_ShouldStillSucceedAndLogTheOrphan()
    {
        StoreSyncFile file = GivenFile();
        _storage
            .Setup(x => x.DeleteAsync(StorageKey, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("El archivo está en uso."));

        var result = await Handler().Handle(new DeleteStoreSyncFileCommand(file.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        _fileRepository.Verify(x => x.SoftDeleteAsync(file), Times.Once);
    }

    #endregion
}
