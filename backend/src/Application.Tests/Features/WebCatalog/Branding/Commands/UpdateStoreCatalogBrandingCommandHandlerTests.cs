using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.WebCatalog.Branding;
using Application.Features.WebCatalog.Branding.Commands.UpdateStoreCatalogBranding;
using Application.UnitOfWorks;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Branding.Commands;

/// <summary>
/// Guardar la MARCA (F8) tiene cinco responsabilidades que este suite fija, y una ausencia que
/// importa más que las cinco:
///
///   1. ALTA la primera vez y ACTUALIZACIÓN después, por `StoreId`, conservando SU `Id` (el índice
///      único de `StoreId` haría fallar un INSERT con id nuevo).
///   2. Escribe SOLO `LogoKey` y `BannerKey`. Es la mitad de una fila compartida (D19): si tocara
///      las columnas de pedidos o la paleta, guardar el logo dejaría al dueño sin pedidos abiertos
///      ni paleta.
///   3. Sube el archivo nuevo y BORRA la key anterior, solo si cambió — y en ese ORDEN: la fila se
///      persiste ANTES de borrar nada (F8-R2). Sin el borrado el disco acumula logos huérfanos que
///      nadie vuelve a pedir; borrando antes de persistir, un fallo deja la fila apuntando a un
///      archivo que ya no existe y el catálogo público responde 404.
///   4. Un PUT PARCIAL: cambiar el logo no puede borrar el banner, ni al revés. Por eso cada
///      lado tiene su archivo y su bandera de borrado, y "no mentions este lado" significa "no lo
///      toques".
///   5. Valida cada archivo con las MISMAS reglas que las imágenes de producto (formato y 2 MB),
///      y valida antes de subir nada.
///
/// Y lo que NO hace: decidir la paleta (cancelada por ahora, se queda la que hay) ni tocar los
/// pedidos.
/// </summary>
public class UpdateStoreCatalogBrandingCommandHandlerTests
{
    private const string NewLogoKey = "tenant/store/branding/logo/new.png";
    private const string NewBannerKey = "tenant/store/branding/banner/new.png";

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<ICatalogImageStorage> _catalogImageStorage = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<ILogger<UpdateStoreCatalogBrandingCommandHandler>> _logger = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    /// <summary>Lo que realmente se pasó al repositorio, para inspeccionarlo después.</summary>
    private StoreCatalogSettings? _persisted;

    public UpdateStoreCatalogBrandingCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _settingsRepository
            .Setup(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()))
            .Returns((StoreCatalogSettings s) => Task.FromResult(s))
            .Callback<StoreCatalogSettings>(s => _persisted = s);

        _catalogImageStorage
            .Setup(x => x.SaveBrandingAsync(
                It.IsAny<CatalogImageUpload>(),
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((CatalogImageUpload _, Guid _, Guid _, string kind, CancellationToken _) =>
                kind == BrandingImageKinds.Logo ? NewLogoKey : NewBannerKey);
    }

    private UpdateStoreCatalogBrandingCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _settingsRepository.Object,
        _catalogImageStorage.Object,
        _localizer.Object,
        _logger.Object);

    /// <summary>Archivo de marca válido: jpg de 1 KB. Los bytes no se miran, solo la cabecera.</summary>
    private static CatalogImageUpload Logo(string fileName = "logo.jpg", string contentType = "image/jpeg", long length = 1024)
        => new(new MemoryStream(new byte[length]), fileName, contentType, length);

    private static CatalogImageUpload Banner(string fileName = "banner.jpg", string contentType = "image/jpeg", long length = 2048)
        => new(new MemoryStream(new byte[length]), fileName, contentType, length);

    /// <summary>
    /// Fila ya existente de la tienda: con la marca que el dueño configuró antes y las columnas de
    /// pedidos con valores que NO se deben perder. Son las que la vista Pedidos WhatsApp escribe:
    /// interruptor, número, modalidades, horarios y zonas (el pedido online no tiene costo de envío
    /// ni importe mínimo, así que la configuración ya no guarda importes).
    /// </summary>
    private StoreCatalogSettings ExistingRow(Guid? id = null, string? logoKey = "old-logo.png", string? bannerKey = "old-banner.png")
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(id ?? Guid.NewGuid(), _storeId, _tenantId);
        settings.Enabled = true;
        settings.WhatsappNumber = "+5350000000";
        settings.PickupEnabled = true;
        settings.DeliveryEnabled = true;
        settings.BusinessHours = "Lun-Vie 8:00-18:00";
        settings.DeliveryZones = "Centro, Vedado";
        settings.SyncedAt = new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.Zero);
        settings.LogoKey = logoKey;
        settings.BannerKey = bannerKey;
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);
        return settings;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_WhenTheStoreHasNoRow_ShouldCreateItForTheStoreInContext()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        _settingsRepository.Verify(x => x.UpsertAsync(It.Is<StoreCatalogSettings>(s =>
            s.StoreId == _storeId
            && s.TenantId == _tenantId
            && s.LogoKey == NewLogoKey)), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenTheRowAlreadyExists_ShouldUpdateThatSameRow()
    {
        StoreCatalogSettings existing = ExistingRow();

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _persisted.Should().BeSameAs(existing);
        _persisted!.LogoKey.Should().Be(NewLogoKey);
    }

    /// <summary>
    /// El `Id` de una fila existente es SU id: cambiarlo convertiría el guardado en un INSERT que
    /// choca con el índice único de `StoreId`.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheRowAlreadyExists_ShouldPreserveItsId()
    {
        var existingId = Guid.NewGuid();
        ExistingRow(existingId);

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _persisted!.Id.Should().Be(existingId);
    }

    [Fact]
    public async Task Handle_WithALogo_ShouldStoreTheKeyReturnedByTheBrandingStorage()
    {
        ExistingRow(logoKey: null, bannerKey: null);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        result.Data!.LogoKey.Should().Be(NewLogoKey);
        _catalogImageStorage.Verify(x => x.SaveBrandingAsync(
            It.IsAny<CatalogImageUpload>(), _tenantId, _storeId, BrandingImageKinds.Logo, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithABanner_ShouldStoreTheKeyReturnedByTheBrandingStorage()
    {
        ExistingRow(logoKey: null, bannerKey: null);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, Banner(), false), CancellationToken.None);

        result.Data!.BannerKey.Should().Be(NewBannerKey);
        _catalogImageStorage.Verify(x => x.SaveBrandingAsync(
            It.IsAny<CatalogImageUpload>(), _tenantId, _storeId, BrandingImageKinds.Banner, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    /// <summary>
    /// Logo y banner se guardan en una sola llamada: la marca es una sola operación de configuración
    /// y el dueño manda los dos en el mismo formulario.
    /// </summary>
    [Fact]
    public async Task Handle_WithBothFiles_ShouldSaveBothAndReturnBoth()
    {
        ExistingRow(logoKey: null, bannerKey: null);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(), false, Banner(), false), CancellationToken.None);

        result.Data!.LogoKey.Should().Be(NewLogoKey);
        result.Data.BannerKey.Should().Be(NewBannerKey);
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Once);
    }

    /// <summary>El guardado real lo hace el UnitOfWork, una vez, después del upsert.</summary>
    [Fact]
    public async Task Handle_ShouldPersistThroughTheUnitOfWork()
    {
        ExistingRow(logoKey: null, bannerKey: null);

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// El guardado va por el upsert explícito del repositorio. Un `UpdateAsync`/`AddAsync` a mano
    /// sobre una entidad cargada no escribiría NADA (`ApplicationDbContext` es NoTracking) — sin
    /// error y sin aviso.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldGoThroughTheRepositoryUpsert()
    {
        ExistingRow(logoKey: null, bannerKey: null);

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Once);
        _settingsRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _settingsRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    #endregion

    #region The ordering columns survive (D19)

    /// <summary>
    /// ESTE es el test que protege la fila compartida. Marca y pedidos son dos vistas (F1 y F8) sobre
    /// la MISMA fila: si el guardado de la marca tocara una columna de pedidos, el dueño perdería
    /// los pedidos que tenía abiertos cada vez que subiera su logo.
    ///
    /// Las columnas que se comprueban son las que la vista Pedidos WhatsApp sigue escribiendo
    /// (interruptor, número, modalidades, horarios y zonas). Ya no hay importes que proteger:
    /// desde 2026-10-08 el pedido online no tiene costo de envío ni importe mínimo.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNotTouchTheOrderingColumnsOfAnExistingRow()
    {
        ExistingRow(logoKey: null, bannerKey: null);

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, Banner(), false), CancellationToken.None);

        _persisted!.Enabled.Should().BeTrue();
        _persisted.WhatsappNumber.Should().Be("+5350000000");
        _persisted.PickupEnabled.Should().BeTrue();
        _persisted.DeliveryEnabled.Should().BeTrue();
        _persisted.BusinessHours.Should().Be("Lun-Vie 8:00-18:00");
        _persisted.DeliveryZones.Should().Be("Centro, Vedado");
    }

    /// <summary>
    /// `SyncedAt` es el sello de F1: subir un logo no es sincronizar los pedidos, así que no lo
    /// toca esta feature.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNotTouchSyncedAt()
    {
        var syncedAt = new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.Zero);
        ExistingRow(logoKey: null, bannerKey: null).SyncedAt = syncedAt;

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _persisted!.SyncedAt.Should().Be(syncedAt);
    }

    /// <summary>
    /// Las paletas se cancelaron: `PaletteId` se queda con su default y esta feature NO lo escribe.
    /// Una fila que ya tuviera otra paleta la conserva (el command ni la lee).
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNotWriteThePalette()
    {
        StoreCatalogSettings existing = ExistingRow(logoKey: null, bannerKey: null);
        existing.PaletteId = "sunset";

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _persisted!.PaletteId.Should().Be("sunset");
    }

    /// <summary>Una fila nueva nace con la paleta por defecto, que es la que el catálogo ya usa.</summary>
    [Fact]
    public async Task Handle_WhenTheRowIsNew_ShouldStartWithTheDefaultPalette()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _persisted!.PaletteId.Should().Be(StoreCatalogSettings.DefaultPaletteId);
        _persisted.BannerKey.Should().BeNull();
    }

    #endregion

    #region Partial PUT: one side never touches the other

    /// <summary>
    /// Subir el logo NO borra el banner. Un PUT que fuera "reemplaza toda la marca" obligaría a la
    /// vista a reenviar el banner entero en cada cambio de logo, y un fallo en ese reenvío perdería
    /// la imagen que el dueño ya tenía.
    /// </summary>
    [Fact]
    public async Task Handle_WithOnlyALogo_ShouldKeepTheExistingBanner()
    {
        ExistingRow(bannerKey: "old-banner.png");

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _persisted!.BannerKey.Should().Be("old-banner.png");
        _catalogImageStorage.Verify(
            x => x.DeleteAsync("old-banner.png", It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithOnlyABanner_ShouldKeepTheExistingLogo()
    {
        ExistingRow(logoKey: "old-logo.png");

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(null, false, Banner(), false), CancellationToken.None);

        _persisted!.LogoKey.Should().Be("old-logo.png");
        _catalogImageStorage.Verify(x => x.DeleteAsync("old-logo.png", It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Ningún lado liberado: la fila se reescribe igual (con las mismas claves), lo que la deja
    /// inalterada. Es el PUT idempotente.
    /// </summary>
    [Fact]
    public async Task Handle_WithNothingToChange_ShouldLeaveBothKeysAsTheyWere()
    {
        ExistingRow();

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false), CancellationToken.None);

        result.Data!.LogoKey.Should().Be("old-logo.png");
        result.Data.BannerKey.Should().Be("old-banner.png");
        _catalogImageStorage.Verify(
            x => x.SaveBrandingAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _catalogImageStorage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion

    #region Removing

    /// <summary>Quitar el logo deja la columna en null y borra el archivo del disco.</summary>
    [Fact]
    public async Task Handle_WithRemoveLogo_ShouldClearTheKeyAndDeleteTheFile()
    {
        ExistingRow();

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, true, null, false), CancellationToken.None);

        result.Data!.LogoKey.Should().BeNull();
        _persisted!.BannerKey.Should().Be("old-banner.png");
        _catalogImageStorage.Verify(x => x.DeleteAsync("old-logo.png", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WithRemoveBanner_ShouldClearTheKeyAndDeleteTheFile()
    {
        ExistingRow();

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, true), CancellationToken.None);

        result.Data!.BannerKey.Should().BeNull();
        _persisted!.LogoKey.Should().Be("old-logo.png");
        _catalogImageStorage.Verify(x => x.DeleteAsync("old-banner.png", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WithRemoveBoth_ShouldClearBoth()
    {
        ExistingRow();

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, true, null, true), CancellationToken.None);

        result.Data!.LogoKey.Should().BeNull();
        result.Data.BannerKey.Should().BeNull();
    }

    /// <summary>
    /// La fila sigue existiendo: quitar la marca no deshabilita los pedidos. La configuración de
    /// pedidos es de otra vista (F1) y esta no la toca.
    /// </summary>
    [Fact]
    public async Task Handle_WithRemoveLogo_ShouldNotDisableTheStore()
    {
        ExistingRow();

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(null, true, null, false), CancellationToken.None);

        _persisted!.Enabled.Should().BeTrue();
        _settingsRepository.Verify(x => x.DeleteAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>
    /// Quitar algo que no está no borra nada: no hay archivo que borrar, y no es un error — el
    /// resultado deseado ("sin logo") ya se cumple.
    /// </summary>
    [Fact]
    public async Task Handle_WithRemoveLogoOnAStoreWithoutOne_ShouldNotDeleteAnything()
    {
        ExistingRow(logoKey: null);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, true, null, false), CancellationToken.None);

        result.Data!.LogoKey.Should().BeNull();
        _catalogImageStorage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Reemplazar borra la key anterior. Sin ese borrado, cada cambio de logo dejaría un archivo
    /// huérfano en el disco que ya nadie va a pedir.
    /// </summary>
    [Fact]
    public async Task Handle_WithANewLogoOnAStoreWithOne_ShouldDeleteThePreviousFile()
    {
        ExistingRow(logoKey: "old-logo.png");

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _catalogImageStorage.Verify(x => x.DeleteAsync("old-logo.png", It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>Subir un logo donde no había ninguno no borra nada.</summary>
    [Fact]
    public async Task Handle_WithANewLogoOnAStoreWithoutOne_ShouldNotDeleteAnyFile()
    {
        ExistingRow(logoKey: null);

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _catalogImageStorage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// F8-R2: la key guardada es la NUEVA, y lo es porque el borrado del archivo anterior va DESPUÉS
    /// de persistir. Antes, el orden era borrar → guardar: si `SaveChanges` fallaba, la fila se
    /// quedaba apuntando a un archivo que ya no existía y el catálogo público respondía 404 por la
    /// marca que el dueño acababa de subir. Ahora la fila nunca apunta a un archivo borrado.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldStoreTheNewKeyAndNeverTheOldOne()
    {
        ExistingRow(logoKey: "old-logo.png");

        await Handler().Handle(new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        _persisted!.LogoKey.Should().Be(NewLogoKey);
        _persisted.LogoKey.Should().NotBe("old-logo.png");
    }

    #endregion

    #region The row is persisted BEFORE the previous file is deleted (F8-R2)

    /// <summary>
    /// ESTE es el guardián de F8-R2. Si `SaveChanges` falla, el logo NUEVO se borra (está en disco pero
    /// la fila no lo apunta: sería un huérfano) y el ANTERIOR sobrevive intacto (la fila sigue apuntando
    /// a él, así que borrarlo dejaría al catálogo público pidiendo un 404). El orden correcto es
    /// guardar → persistir → borrar; el inverso rompía el catálogo en el fallo.
    /// </summary>
    [Fact]
    public async Task Handle_WhenThePersistenceFails_ShouldKeepThePreviousFileAndDeleteTheNewOne()
    {
        ExistingRow(logoKey: "old-logo.png");
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("La base de datos no responde."));

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
        _catalogImageStorage.Verify(x => x.DeleteAsync("old-logo.png", It.IsAny<CancellationToken>()), Times.Never);
        _catalogImageStorage.Verify(x => x.DeleteAsync(NewLogoKey, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// El otro lado del mismo orden: si el borrado del archivo anterior falla, la fila YA está
    /// guardada y apunta a la key nueva, que sí existe. Relanzar convertiría un 200 correcto en un
    /// fallo y el reintento del dueño no podría reparar nada — el archivo viejo es deuda de disco, no
    /// un error de la operación. Se registra con `LogWarning` (mismo patrón que
    /// `RemoveStoreCatalogImageCommandHandler`).
    /// </summary>
    [Fact]
    public async Task Handle_WhenThePreviousFileCannotBeDeleted_ShouldStillSucceed()
    {
        ExistingRow(logoKey: "old-logo.png");
        _catalogImageStorage
            .Setup(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("El disco no responde."));

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.LogoKey.Should().Be(NewLogoKey);
        _persisted!.LogoKey.Should().Be(NewLogoKey);
        _logger.Verify(
            x => x.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.IsAny<It.IsAnyType>(),
                It.IsAny<IOException>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    #endregion

    #region File validation

    /// <summary>
    /// Un formato que no es imagen se rechaza con 400 y localized antes de subir NADA: el archivo se
    /// valida igual que una imagen de producto, no hay puerta trasera en la marca.
    /// </summary>
    [Theory]
    [InlineData("logo.txt", "text/plain")]
    [InlineData("logo.gif", "image/gif")]
    [InlineData("logo", "application/octet-stream")]
    public async Task Handle_WithAnInvalidLogo_ShouldRejectWithoutSavingAnything(string fileName, string contentType)
    {
        ExistingRow();

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(fileName, contentType), false, null, false),
            CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _catalogImageStorage.Verify(
            x => x.SaveBrandingAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>El límite de tamaño es el de las imágenes de producto: 2 MB.</summary>
    [Fact]
    public async Task Handle_WithALogoOverTheSizeLimit_ShouldRejectWithoutSavingAnything()
    {
        ExistingRow();

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo("logo.jpg", "image/jpeg", 2 * 1024 * 1024 + 1), false, null, false),
            CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _catalogImageStorage.Verify(
            x => x.SaveBrandingAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    /// <summary>El banner se valida con las MISMAS reglas: la marca no es una puerta distinta.</summary>
    [Fact]
    public async Task Handle_WithAnInvalidBanner_ShouldRejectWithoutSavingAnything()
    {
        ExistingRow();

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, Banner("banner.txt", "text/plain"), false),
            CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>
    /// F8-R1: si el logo es válido pero el banner no, NINGÚN ARCHIVO se escribe, y no solo ninguna
    /// fila se persiste. Validar cada lado justo antes de guardarlo dejaba el logo ya en el disco
    /// cuando el banner fallaba: el dueño recibía un 400 correcto y, con cada intento, otro logo
    /// huérfano que nadie volvería a pedir. Por eso la validación de los dos lados es up-front, y este
    /// test mira `SaveBrandingAsync` además del upsert.
    /// </summary>
    [Fact]
    public async Task Handle_WithAValidLogoAndAnInvalidBanner_ShouldNotSaveAnyFile()
    {
        ExistingRow(logoKey: null, bannerKey: null);

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(), false, Banner("banner.txt", "text/plain"), false),
            CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _catalogImageStorage.Verify(
            x => x.SaveBrandingAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _catalogImageStorage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>Un archivo vacío (lo que deja el binding cuando el multipart no trae nada) es inválido.</summary>
    [Fact]
    public async Task Handle_WithAnEmptyLogo_ShouldReject()
    {
        ExistingRow();

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo("logo.jpg", "image/jpeg", 0), false, null, false),
            CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto no hay fila que guardar: no se adivina la tienda ni se escribe en
    /// la de otro. Se rechaza antes de subir un solo archivo.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(Logo(), false, null, false), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _catalogImageStorage.Verify(
            x => x.SaveBrandingAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    #endregion
}