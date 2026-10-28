using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.StoreSync.Commands.UploadStoreSyncFile;
using Application.UnitOfWorks;
using Domain.Common.Limits;
using Domain.Entities.StoreSyncFiles;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreSync.Commands;

/// <summary>
/// Subir un fichero de sincronización tiene cuatro responsabilidades y una ausencia:
///
///   1. El archivo pertenece a UNA tienda (S1) y esa tienda se valida contra el ÁMBITO del llamador
///      ANTES de escribir (S6). Un StoreUser solo puede subir a la tienda de su claim; un Owner,
///      a cualquiera de las suyas. Fuera del ámbito la respuesta es 404, nunca 403.
///   2. El nombre de la tienda y el nombre completo del usuario se guardan como FOTOGRAFÍAS (S3):
///      la lista no depende de que la tienda o el usuario conserven el nombre de hoy.
///   3. El tamaño se valida ANTES de tocar el disco (S10): 0 bytes es 400, más de 50 MB es 413 y
///      ninguno de los dos deja fila ni blob.
///   4. El nombre se normaliza a un NOMBRE, no a una ruta: viaja en la cabecera de descarga.
///
/// Y la ausencia: los bytes son opacos (S13) — la contraseña nunca llega aquí y este handler no
/// inspecciona, descifra ni re-cifra nada.
/// </summary>
public class UploadStoreSyncFileCommandHandlerTests
{
    private const string SavedKey = "tenant/store/file.zip";
    private const string UploaderFullName = "Ana María Pérez";

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreSyncFileRepository> _fileRepository = new();
    private readonly Mock<IStoreSyncFileStorage> _storage = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IUserRepository> _userRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<ILogger<UploadStoreSyncFileCommandHandler>> _logger = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerId = Guid.NewGuid();
    private readonly Store _store;
    private readonly Guid _storeId;

    /// <summary>Lo que realmente se pasó al repositorio, para inspeccionarlo después.</summary>
    private StoreSyncFile? _persisted;

    public UploadStoreSyncFileCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns((string name) => new LocalizedString(name, name));

        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _store = Store.Create("Tienda Centro", _ownerId, true, _tenantId);
        _storeId = _store.Id;

        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(_ownerId.ToString());
        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);

        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        _storage
            .Setup(x => x.SaveAsync(
                It.IsAny<StoreSyncFileUpload>(),
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(SavedKey);

        _storeRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync([_store]);
        _storeRepository
            .Setup(x => x.GetStoreByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(_store);

        _userRepository
            .Setup(x => x.GetUserByIdIncludingStoreAndRoles(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(User.Create(_ownerId, "owner", "hash", UploaderFullName, "0000000000", null, _tenantId));

        _fileRepository
            .Setup(x => x.AddAsync(It.IsAny<StoreSyncFile>()))
            .Returns((StoreSyncFile file) => Task.FromResult(file))
            .Callback<StoreSyncFile>(file => _persisted = file);
    }

    private UploadStoreSyncFileCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _fileRepository.Object,
        _storage.Object,
        _storeRepository.Object,
        _userRepository.Object,
        _localizer.Object,
        _logger.Object);

    private UploadStoreSyncFileCommand Command(
        Guid? storeId = null,
        string fileName = "respaldo-tienda.zip",
        string contentType = "application/zip",
        long length = 2048)
        => new(storeId ?? _storeId, new MemoryStream(new byte[16]), fileName, contentType, length);

    private void GivenStoreUser(string storeId)
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);
        _httpContextService.Setup(x => x.StoreId).Returns(storeId);
    }

    #region Happy path

    /// <summary>
    /// El alta guarda la fila con la tienda pedida y congela tienda + nombre del usuario (S1, S3).
    /// El DTO sale con la misma forma que devolverá la lista, sin marca de descarga todavía (S4).
    /// </summary>
    [Fact]
    public async Task Handle_WithAValidFile_ShouldPersistTheSnapshotsAndReturnTheDto()
    {
        var result = await Handler().Handle(Command(fileName: "respaldo-tienda.zip"), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted.Should().NotBeNull();
        _persisted!.StoreId.Should().Be(_storeId);
        _persisted.TenantId.Should().Be(_tenantId);
        _persisted.FileName.Should().Be("respaldo-tienda.zip");
        _persisted.ContentType.Should().Be("application/zip");
        _persisted.SizeBytes.Should().Be(2048);
        _persisted.StorageKey.Should().Be(SavedKey);
        _persisted.UploadedByUserId.Should().Be(_ownerId);
        _persisted.UploadedByFullName.Should().Be(UploaderFullName);
        _persisted.StoreName.Should().Be("Tienda Centro");
        _persisted.DownloadCount.Should().Be(0);
        _persisted.IsActive.Should().BeTrue();

        result.Data.Id.Should().Be(_persisted.Id);
        result.Data.StoreName.Should().Be("Tienda Centro");
        result.Data.UploadedByFullName.Should().Be(UploaderFullName);
        result.Data.DownloadedByMe.Should().BeFalse();
        result.Data.DownloadedByMeAt.Should().BeNull();
    }

    /// <summary>
    /// El nombre persistido no puede llevar caracteres de control (R1): un CR, un LF o un NUL
    /// sobreviven a `Path.GetFileName`, se guardan en la fila y luego viajan en la cabecera
    /// `Content-Disposition`, donde invalidan la respuesta y dejan el fichero indescargable para
    /// TODOS los que lo ven, no solo para quien lo subió.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheFileNameHasControlCharacters_ShouldStripThemBeforePersisting()
    {
        var result = await Handler().Handle(
            Command(fileName: "respaldo\r\nX-Injected: 1\u0000.zip"), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted!.FileName.Should().Be("respaldoX-Injected: 1.zip");
        _persisted.FileName.Should().NotContain("\r").And.NotContain("\n").And.NotContain("\u0000");
        result.Data.FileName.Should().Be("respaldoX-Injected: 1.zip");
    }

    /// <summary>Un nombre hecho SOLO de controles cae al nombre de reserva, no a una fila inválida.</summary>
    [Fact]
    public async Task Handle_WhenTheFileNameIsOnlyControlCharacters_ShouldFallBackToTheDefaultName()
    {
        await Handler().Handle(Command(fileName: "\r\n\u0000"), CancellationToken.None);

        _persisted!.FileName.Should().Be("backup.zip");
    }

    /// <summary>
    /// Un fallo del ALMACENAMIENTO (disco lleno, permiso, raíz inexistente) ya no escapa como
    /// excepción sin localizar (R3-4): se traduce al 500 del repositorio y no se escribe ninguna fila.
    /// El almacenamiento escribe a un temporal y renombra, así que tampoco queda un ZIP truncado.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStorageFails_ShouldReportTheLocalizedServerErrorAndWriteNoRow()
    {
        _storage
            .Setup(x => x.SaveAsync(It.IsAny<StoreSyncFileUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
                It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("disco lleno"));

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        exception.Which.Message.Should().Be("StoreSyncFileUploadFailed");
        _persisted.Should().BeNull();
        _fileRepository.Verify(x => x.AddAsync(It.IsAny<StoreSyncFile>()), Times.Never);
    }

    /// <summary>
    /// La clave del blob lleva el id de la fila: el almacenamiento escribe ANTES de que la fila
    /// exista, así que el id tiene que nacer primero y ser el mismo en los dos sitios.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldSaveTheBlobUnderTheRowIdAndTenant()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _storage.Verify(x => x.SaveAsync(
            It.IsAny<StoreSyncFileUpload>(), _tenantId, _storeId, _persisted!.Id, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    /// <summary>La persistencia la hace el UnitOfWork, una vez, después del alta.</summary>
    [Fact]
    public async Task Handle_ShouldPersistThroughTheUnitOfWork()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>Un alta correcta NO borra el archivo: es la clave que la fila publica.</summary>
    [Fact]
    public async Task Handle_WhenThePersistenceSucceeds_ShouldKeepTheFile()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _storage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion

    #region Scope (S5, S6)

    /// <summary>
    /// El Owner sube a CUALQUIERA de sus tiendas (S6), no solo a la seleccionada en el POS: el POS
    /// sube N archivos, uno por tienda, desde la misma sesión.
    /// </summary>
    [Fact]
    public async Task Handle_WhenAnOwnerUploadsToAnotherOwnedStore_ShouldAcceptIt()
    {
        Store other = Store.Create("Tienda Norte", _ownerId, true, _tenantId);
        _storeRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(_ownerId, It.IsAny<Guid?>()))
            .ReturnsAsync([_store, other]);

        var result = await Handler().Handle(Command(storeId: other.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted!.StoreId.Should().Be(other.Id);
        _persisted.StoreName.Should().Be("Tienda Norte");
    }

    /// <summary>
    /// Una tienda que no es del Owner responde exactamente como una inexistente: 404, y no se
    /// escribe NADA — ni blob (S10: el archivo no se escribe cuando se rechaza) ni fila.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreIsNotOwned_ShouldRejectAsNotFoundWithoutWriting()
    {
        Guid foreignStoreId = Guid.NewGuid();

        Func<Task> act = () => Handler().Handle(Command(storeId: foreignStoreId), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        exception.Which.Message.Should().Be("StoreSyncFileStoreNotAllowed");
        _storage.Verify(x => x.SaveAsync(
            It.IsAny<StoreSyncFileUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _fileRepository.Verify(x => x.AddAsync(It.IsAny<StoreSyncFile>()), Times.Never);
    }

    /// <summary>
    /// El StoreUser sube SOLO a la tienda de su claim (S6). La tienda que llega en el formulario no
    /// puede ampliar su ámbito.
    /// </summary>
    [Fact]
    public async Task Handle_WhenAStoreUserUploadsToItsOwnStore_ShouldAcceptIt()
    {
        GivenStoreUser(_storeId.ToString());

        var result = await Handler().Handle(Command(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted!.StoreId.Should().Be(_storeId);
    }

    /// <summary>
    /// Y a la tienda de otro responde 404 sin escribir. La comprobación se hace ANTES de resolver
    /// la tienda, así que ni siquiera se consulta una tienda que no es suya.
    /// </summary>
    [Fact]
    public async Task Handle_WhenAStoreUserUploadsToAnotherStore_ShouldRejectAsNotFoundWithoutWriting()
    {
        GivenStoreUser(_storeId.ToString());
        Guid foreignStoreId = Guid.NewGuid();

        Func<Task> act = () => Handler().Handle(Command(storeId: foreignStoreId), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _storeRepository.Verify(x => x.GetStoreByIdAsync(foreignStoreId), Times.Never);
        _storage.Verify(x => x.SaveAsync(
            It.IsAny<StoreSyncFileUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _fileRepository.Verify(x => x.AddAsync(It.IsAny<StoreSyncFile>()), Times.Never);
    }

    #endregion

    #region Size limit (S10)

    /// <summary>
    /// 0 bytes es lo que deja el binding cuando el multipart no trae archivo: 400, y no una fila
    /// con una clave que no apunta a ningún sitio.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnEmptyFile_ShouldRejectWithoutWriting()
    {
        Func<Task> act = () => Handler().Handle(Command(length: 0), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().Be("StoreSyncFileEmpty");
        _storage.Verify(x => x.SaveAsync(
            It.IsAny<StoreSyncFileUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _fileRepository.Verify(x => x.AddAsync(It.IsAny<StoreSyncFile>()), Times.Never);
    }

    /// <summary>Por encima de 50 MB es 413 y el archivo no se escribe (S10).</summary>
    [Fact]
    public async Task Handle_WithAFileOverTheLimit_ShouldRejectWithRequestEntityTooLargeWithoutWriting()
    {
        Func<Task> act = () => Handler().Handle(
            Command(length: StoreSyncFileLimits.MaxFileSizeInBytes + 1), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        _storage.Verify(x => x.SaveAsync(
            It.IsAny<StoreSyncFileUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _fileRepository.Verify(x => x.AddAsync(It.IsAny<StoreSyncFile>()), Times.Never);
    }

    /// <summary>El límite es "hasta 50 MB": exactamente 50 MB entra (el corte es &gt;, no &gt;=).</summary>
    [Fact]
    public async Task Handle_WithAFileAtTheLimit_ShouldAcceptIt()
    {
        var result = await Handler().Handle(
            Command(length: StoreSyncFileLimits.MaxFileSizeInBytes), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted!.SizeBytes.Should().Be(StoreSyncFileLimits.MaxFileSizeInBytes);
    }

    #endregion

    #region Context and uploader

    /// <summary>
    /// Sin tenant no se puede escribir el `TenantId`: una fila con Guid.Empty queda invisible para
    /// siempre por el filtro global, con su blob ya en disco. Se rechaza antes de tocar nada.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutATenantInContext_ShouldRejectWithoutWriting()
    {
        _httpContextService.Setup(x => x.TenantId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _storage.Verify(x => x.SaveAsync(
            It.IsAny<StoreSyncFileUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// El nombre completo del uploader es una columna obligatoria (S3): sin usuario no hay
    /// fotografía que guardar, y se rechaza antes de escribir el blob.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheUploaderDoesNotExist_ShouldRejectWithoutWriting()
    {
        _userRepository.Setup(x => x.GetUserByIdIncludingStoreAndRoles(_ownerId, It.IsAny<CancellationToken>())).ReturnsAsync((User)null!);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().Be("StoreSyncFileUploadFailed");
        _storage.Verify(x => x.SaveAsync(
            It.IsAny<StoreSyncFileUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion

    #region File name and content type

    /// <summary>
    /// El nombre que llega del navegador puede traer una ruta (`C:\fakepath\…`). Lo que se guarda y
    /// se devuelve en la cabecera de descarga es el NOMBRE, nunca una ruta.
    /// </summary>
    [Theory]
    [InlineData("C:\\fakepath\\respaldo.zip", "respaldo.zip")]
    [InlineData("/tmp/respaldo.zip", "respaldo.zip")]
    [InlineData("  respaldo.zip  ", "respaldo.zip")]
    public async Task Handle_WithAPathInTheName_ShouldKeepOnlyTheFileName(string incoming, string expected)
    {
        await Handler().Handle(Command(fileName: incoming), CancellationToken.None);

        _persisted!.FileName.Should().Be(expected);
    }

    /// <summary>Sin nombre utilizable se usa el nombre de reserva, no una cadena vacía.</summary>
    [Fact]
    public async Task Handle_WithoutAFileName_ShouldUseTheFallback()
    {
        await Handler().Handle(Command(fileName: "   "), CancellationToken.None);

        _persisted!.FileName.Should().Be("backup.zip");
    }

    /// <summary>Un nombre larguísimo se recorta al ancho de la columna en vez de reventar en PostgreSQL.</summary>
    [Fact]
    public async Task Handle_WithAnOverlongFileName_ShouldTruncateIt()
    {
        string name = new string('a', StoreSyncFileLimits.FileNameMaxLength + 20) + ".zip";

        await Handler().Handle(Command(fileName: name), CancellationToken.None);

        _persisted!.FileName.Should().HaveLength(StoreSyncFileLimits.FileNameMaxLength);
    }

    /// <summary>
    /// Un content type vacío se guarda como ZIP: la descarga siempre sirve el fichero como
    /// `application/zip`, y una fila sin content type no debe producir una respuesta sin tipo.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAContentType_ShouldStoreTheZipContentType()
    {
        await Handler().Handle(Command(contentType: string.Empty), CancellationToken.None);

        _persisted!.ContentType.Should().Be(StoreSyncFileLimits.ContentType);
    }

    #endregion

    #region Compensation (blob <-> row)

    /// <summary>
    /// El blob se escribe ANTES de la fila; si la fila no se persiste, el blob queda huérfano y
    /// nadie volvería a pedir su clave. La compensación lo borra y el cliente recibe el 500
    /// localizado, no un texto de EF.
    /// </summary>
    [Fact]
    public async Task Handle_WhenThePersistenceFails_ShouldDeleteTheJustSavedFileAndReportServerError()
    {
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("No se pudo guardar la fila."));

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        exception.Which.Message.Should().Be("StoreSyncFileUploadFailed");
        _storage.Verify(x => x.DeleteAsync(SavedKey, CancellationToken.None), Times.Once);
    }

    /// <summary>
    /// Si la limpieza también falla, el 500 sigue siendo el de la subida: la compensación no puede
    /// reemplazar la causa real, y el blob queda como deuda de disco registrada.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheCleanupFails_ShouldStillReportTheUploadFailure()
    {
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("No se pudo guardar la fila."));
        _storage
            .Setup(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("El archivo está en uso."));

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        exception.Which.Message.Should().Be("StoreSyncFileUploadFailed");
        _fileRepository.Verify(x => x.AddAsync(It.IsAny<StoreSyncFile>()), Times.Once);
    }

    #endregion
}
