using Application.Abstractions.HttpContext;
using Application.Features.StoreSync.Queries.GetStoreSyncFiles;
using Domain.Entities.StoreSyncFiles;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Application.Tests.Features.StoreSync.Queries;

/// <summary>
/// El listado tiene tres reglas y un contrato de forma:
///
///   * El ámbito se decide ANTES de la consulta (S5): Owner y ReSeller piden todas las tiendas del
///     tenant (filtro null); un StoreUser pide SOLO la tienda de su claim. Un claim vacío filtra por
///     Guid.Empty, que no casa con ninguna fila — nunca "todas".
///   * La marca de descarga es POR USUARIO y en LOTE (S4): una consulta por fichero convertiría una
///     pantalla con cien ficheros en cien viajes. La marca no oculta ni bloquea nada.
///   * El orden es el que trae el repositorio (S3: fecha descendente) y el handler no lo altera.
///   * El DTO conserva las FOTOGRAFÍAS de tienda y usuario, no joins.
///
/// Y una decisión de pantalla: una tienda sin ficheros devuelve una lista VACÍA, no un 404.
/// </summary>
public class GetStoreSyncFilesQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreSyncFileRepository> _fileRepository = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _userId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();

    public GetStoreSyncFilesQueryHandlerTests()
    {
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(_userId.ToString());
        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);

        _fileRepository
            .Setup(x => x.GetActiveOrderedByDateAsync(It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        _fileRepository
            .Setup(x => x.GetDownloadsByUserAsync(
                It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
    }

    private GetStoreSyncFilesQueryHandler Handler() => new(
        _httpContextService.Object,
        _fileRepository.Object);

    private StoreSyncFile File(
        string fileName,
        DateTimeOffset? createdAt = null,
        string storeName = "Tienda Centro",
        int downloadCount = 0,
        Guid? storeId = null,
        Guid? uploaderId = null)
    {
        Guid owner = storeId ?? _storeId;
        StoreSyncFile file = StoreSyncFile.Create(
            owner,
            _tenantId,
            fileName,
            "application/zip",
            4096,
            $"{_tenantId:N}/{owner:N}/{Guid.NewGuid():N}.zip",
            uploaderId ?? _userId,
            "Ana María Pérez",
            storeName);
        file.CreatedDate = createdAt ?? DateTimeOffset.UtcNow;
        file.DownloadCount = downloadCount;
        return file;
    }

    private void Given(params StoreSyncFile[] files)
        => _fileRepository
            .Setup(x => x.GetActiveOrderedByDateAsync(It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(files);

    private void GivenUserDownloaded(params StoreSyncFileDownload[] downloads)
        => _fileRepository
            .Setup(x => x.GetDownloadsByUserAsync(
                It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(downloads);

    #region Scope (S5)

    /// <summary>El Owner pide TODAS las tiendas del tenant: filtro null, no la tienda seleccionada.</summary>
    [Fact]
    public async Task Handle_WhenTheCallerIsAnOwner_ShouldQueryEveryStoreOfTheTenant()
    {
        Given(File("centro.zip"));

        await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        _fileRepository.Verify(
            x => x.GetActiveOrderedByDateAsync(null, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>El ReSeller ve lo mismo que el Owner: todas las tiendas de su tenant.</summary>
    [Fact]
    public async Task Handle_WhenTheCallerIsAReSeller_ShouldQueryEveryStoreOfTheTenant()
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);
        _httpContextService.Setup(x => x.IsReSeller).Returns(true);
        Given(File("centro.zip"));

        await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        _fileRepository.Verify(
            x => x.GetActiveOrderedByDateAsync(null, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>El StoreUser ve SOLO los ficheros de la tienda de su claim (S5).</summary>
    [Fact]
    public async Task Handle_WhenTheCallerIsAStoreUser_ShouldQueryOnlyItsStore()
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);
        Given(File("centro.zip"));

        await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        _fileRepository.Verify(
            x => x.GetActiveOrderedByDateAsync(_storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// Un StoreUser sin tienda en el claim NO se convierte en "todas": filtra por Guid.Empty.
    /// Convertirlo en null abriría el repositorio entero a un token incompleto.
    /// </summary>
    [Fact]
    public async Task Handle_WhenAStoreUserHasNoStoreClaim_ShouldNeverWidenToTheWholeTenant()
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);
        _httpContextService.Setup(x => x.IsReSeller).Returns(false);
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);
        Given(File("centro.zip"));

        await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        _fileRepository.Verify(
            x => x.GetActiveOrderedByDateAsync(Guid.Empty, It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion

    #region Shape and marks (S3, S4)

    /// <summary>
    /// El orden del repositorio se conserva tal cual (S3). El handler no reordena: si lo hiciera, la
    /// pantalla y la consulta podrían discrepar.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldPreserveTheRepositoryOrder()
    {
        DateTimeOffset now = DateTimeOffset.UtcNow;
        StoreSyncFile newest = File("nuevo.zip", now);
        StoreSyncFile oldest = File("viejo.zip", now.AddDays(-2));
        Given(newest, oldest);

        var result = await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        result.Data.Select(file => file.Id).Should().Equal(newest.Id, oldest.Id);
    }

    /// <summary>
    /// La marca es DEL USUARIO de la petición y se pide en LOTE con los ids de la lista: el
    /// repositorio devuelve las marcas de otros usuarios que no deben mezclarse aquí.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldAskForTheCallersMarksForExactlyTheListedFiles()
    {
        StoreSyncFile first = File("uno.zip");
        StoreSyncFile second = File("dos.zip");
        Given(first, second);

        await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        _fileRepository.Verify(x => x.GetDownloadsByUserAsync(
                _userId,
                It.Is<IReadOnlyCollection<Guid>>(ids => ids.Count == 2 && ids.Contains(first.Id) && ids.Contains(second.Id)),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    /// <summary>
    /// `downloadedByMe` es informativo (S4): el fichero descargado sigue en la lista, con la fecha
    /// de la primera descarga de ESE usuario. El no descargado viaja con false y fecha null.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldMarkOnlyTheFilesDownloadedByTheCaller()
    {
        StoreSyncFile downloaded = File("descargado.zip", downloadCount: 3);
        StoreSyncFile pending = File("pendiente.zip");
        DateTimeOffset downloadedAt = DateTimeOffset.UtcNow.AddHours(-4);
        Given(downloaded, pending);
        GivenUserDownloaded(StoreSyncFileDownload.Create(downloaded.Id, _userId, _tenantId, downloadedAt));

        var result = await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        var downloadedDto = result.Data.Single(file => file.Id == downloaded.Id);
        downloadedDto.DownloadedByMe.Should().BeTrue();
        downloadedDto.DownloadedByMeAt.Should().Be(downloadedAt);
        downloadedDto.DownloadCount.Should().Be(3);

        var pendingDto = result.Data.Single(file => file.Id == pending.Id);
        pendingDto.DownloadedByMe.Should().BeFalse();
        pendingDto.DownloadedByMeAt.Should().BeNull();
    }

    /// <summary>
    /// Las columnas de la lista (S3): tienda y nombre completo salen de las FOTOGRAFÍAS guardadas
    /// en la fila, no de joins ni del usuario de la sesión.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldProjectTheSnapshotsAndTheUploadMetadata()
    {
        DateTimeOffset createdAt = DateTimeOffset.UtcNow.AddMinutes(-30);
        StoreSyncFile file = File("centro.zip", createdAt, storeName: "Tienda Histórica", downloadCount: 2);
        Given(file);

        var result = await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        var dto = result.Data.Single();
        dto.Id.Should().Be(file.Id);
        dto.StoreId.Should().Be(_storeId);
        dto.StoreName.Should().Be("Tienda Histórica");
        dto.FileName.Should().Be("centro.zip");
        dto.SizeBytes.Should().Be(4096);
        dto.UploadedByUserId.Should().Be(_userId);
        dto.UploadedByFullName.Should().Be("Ana María Pérez");
        dto.CreatedAt.Should().Be(createdAt);
        dto.DownloadCount.Should().Be(2);
    }

    /// <summary>
    /// Una tienda sin ficheros es una lista vacía, no un 404: el repositorio recién estrenado está
    /// vacío y la pantalla no debe tratar "sin subidas" como un error.
    /// </summary>
    [Fact]
    public async Task Handle_WhenThereAreNoFiles_ShouldReturnAnEmptyListWithoutAskingForMarks()
    {
        Given();

        var result = await Handler().Handle(new GetStoreSyncFilesQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeEmpty();
        _fileRepository.Verify(x => x.GetDownloadsByUserAsync(
            It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion
}
