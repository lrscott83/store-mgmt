using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.UpsertStoreCatalogSettings;
using Application.UnitOfWorks;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Guardar la configuración de pedidos (el botón "Sincronizar" de la vista Pedidos WhatsApp) tiene
/// tres responsabilidades que este suite fija, y una ausencia que importa más que las tres:
///
///   1. ALTA la primera vez y ACTUALIZACIÓN después, siempre por `StoreId` — nunca por un id que
///      venga del cliente.
///   2. `SyncedAt` sale del `IDateTimeProvider`, no de `DateTime.Now`: el sello tiene que ser el
///      del servidor y ser comprobable en test.
///   3. Se conservan SU `Id` y las columnas de MARCA (`LogoKey`/`BannerKey`/`PaletteId`): marca y
///      configuración comparten fila (D19) y son dos vistas distintas (F8). Si el upsert tocara
///      la marca, la vista Catálogo Web perdería el logo del dueño al guardar pedidos.
///
/// Y lo que NO hace: decidir si el interruptor puede encenderse. Eso es el validador; aquí el
/// dueño ya escribió lo que quiso.
/// </summary>
public class UpsertStoreCatalogSettingsCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly DateTimeOffset _now = new(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);

    /// <summary>Lo que realmente se pasó al repositorio, para inspeccionarlo después.</summary>
    private StoreCatalogSettings? _persisted;

    public UpsertStoreCatalogSettingsCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(_now);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _settingsRepository
            .Setup(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()))
            .Returns((StoreCatalogSettings s) => Task.FromResult(s))
            .Callback<StoreCatalogSettings>(s => _persisted = s);
    }

    private UpsertStoreCatalogSettingsCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _dateTimeProvider.Object,
        _settingsRepository.Object,
        _localizer.Object);

    /// <summary>Config abierta de verdad: número, recogida y domicilio, con horarios y zonas.</summary>
    private static UpsertStoreCatalogSettingsCommand OpenCommand() => new()
    {
        Enabled = true,
        WhatsappNumber = "+5350000000",
        PickupEnabled = true,
        DeliveryEnabled = true,
        BusinessHours = "Lun-Vie 8:00-18:00",
        DeliveryZones = "Centro, Vedado",
    };

    /// <summary>Fila ya existente de la tienda, con marca y un id conocido.</summary>
    private StoreCatalogSettings ExistingRow(Guid? id = null)
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(id ?? Guid.NewGuid(), _storeId, _tenantId);
        settings.Enabled = false;
        settings.LogoKey = "logos/owner-1.png";
        settings.BannerKey = "banners/owner-1.png";
        settings.PaletteId = "sunset";
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);
        return settings;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_WhenTheStoreHasNoSettings_ShouldCreateTheRowForTheStoreInContext()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(OpenCommand(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();

        _settingsRepository.Verify(x => x.UpsertAsync(It.Is<StoreCatalogSettings>(s =>
            s.StoreId == _storeId
            && s.TenantId == _tenantId
            && s.Enabled
            && s.WhatsappNumber == "+5350000000")), Times.Once);
    }

    /// <summary>
    /// Segunda pulsación de "Sincronizar": actualiza la fila que ya existe en vez de insertar otra.
    /// El índice único de `StoreId` (D7) haría fallar el INSERT, así que la ruta de actualización
    /// no es opcional.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreAlreadyHasSettings_ShouldUpdateThatSameRow()
    {
        StoreCatalogSettings existing = ExistingRow();

        var result = await Handler().Handle(OpenCommand(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted.Should().BeSameAs(existing);
        _persisted!.Enabled.Should().BeTrue();
        _persisted.WhatsappNumber.Should().Be("+5350000000");
    }

    /// <summary>
    /// El `Id` de una fila existente es SU id: cambiarlo no actualizaría la fila (haría un INSERT
    /// que choca con el índice único) y además rompería cualquier referencia futura.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheRowAlreadyExists_ShouldPreserveItsId()
    {
        var existingId = Guid.NewGuid();
        ExistingRow(existingId);

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _persisted!.Id.Should().Be(existingId);
    }

    /// <summary>El alta nueva nace con id propio, no con el vacío.</summary>
    [Fact]
    public async Task Handle_WhenTheRowIsNew_ShouldGiveItAFreshId()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _persisted!.Id.Should().NotBeEmpty();
        _persisted.Id.Should().NotBe(Guid.Empty);
    }

    /// <summary>
    /// `SyncedAt` es el sello de "el dueño sincronizó esto", y sale del reloj inyectado: con
    /// `DateTime.Now` este test no podría afirmar nada.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldStampSyncedAtFromTheDateTimeProvider()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _persisted!.SyncedAt.Should().Be(_now);
    }

    /// <summary>El guardado real lo hace el UnitOfWork, una vez, después del upsert.</summary>
    [Fact]
    public async Task Handle_ShouldPersistThroughTheUnitOfWork()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>La respuesta es la configuración ya guardada, para que la vista muestre el sello.</summary>
    [Fact]
    public async Task Handle_ShouldReturnTheSavedSettings()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(OpenCommand(), CancellationToken.None);

        result.Data!.Enabled.Should().BeTrue();
        result.Data.WhatsappNumber.Should().Be("+5350000000");
        result.Data.PickupEnabled.Should().BeTrue();
        result.Data.DeliveryEnabled.Should().BeTrue();
        result.Data.BusinessHours.Should().Be("Lun-Vie 8:00-18:00");
        result.Data.DeliveryZones.Should().Be("Centro, Vedado");
        result.Data.SyncedAt.Should().Be(_now);
    }

    #endregion

    #region Integration / Dependencies

    /// <summary>
    /// D19: marca y configuración comparten fila pero son de dos vistas. Este upsert NO puede
    /// tocar la marca — si la tocase, guardar los pedidos borraría el logo que el dueño subió en
    /// la vista Catálogo Web (F8).
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNotTouchTheBrandColumnsOfAnExistingRow()
    {
        StoreCatalogSettings existing = ExistingRow();

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _persisted!.LogoKey.Should().Be("logos/owner-1.png");
        _persisted.BannerKey.Should().Be("banners/owner-1.png");
        _persisted.PaletteId.Should().Be("sunset");
    }

    /// <summary>La fila nueva nace con la paleta por defecto, la que el catálogo ya usa.</summary>
    [Fact]
    public async Task Handle_WhenTheRowIsNew_ShouldStartWithTheDefaultPalette()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _persisted!.PaletteId.Should().Be(StoreCatalogSettings.DefaultPaletteId);
        _persisted.LogoKey.Should().BeNull();
        _persisted.BannerKey.Should().BeNull();
    }

    /// <summary>
    /// El número va a un link `wa.me`: espacios alrededor romperían el enlace, y un string vacío
    /// en la columna no es lo mismo que "sin número" (null).
    /// </summary>
    [Theory]
    [InlineData("  +5350000000  ", "+5350000000")]
    [InlineData("", null)]
    [InlineData("   ", null)]
    public async Task Handle_ShouldTrimTheWhatsappNumberAndStoreBlankAsNull(string input, string? expected)
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);
        UpsertStoreCatalogSettingsCommand command = OpenCommand();
        command.WhatsappNumber = input;

        await Handler().Handle(command, CancellationToken.None);

        _persisted!.WhatsappNumber.Should().Be(expected);
    }

    /// <summary>Un número ausente no borra la marca, pero sí se escribe como null (no queda basura).</summary>
    [Fact]
    public async Task Handle_ShouldTrimBusinessHoursAndDeliveryZonesToo()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);
        UpsertStoreCatalogSettingsCommand command = OpenCommand();
        command.BusinessHours = "  Lun-Vie 8:00-18:00  ";
        command.DeliveryZones = "  ";

        await Handler().Handle(command, CancellationToken.None);

        _persisted!.BusinessHours.Should().Be("Lun-Vie 8:00-18:00");
        _persisted.DeliveryZones.Should().BeNull();
    }

    /// <summary>
    /// Apagar el interruptor es una operación normal, no un borrado: la fila y su marca se quedan,
    /// y el storefront deja de ofrecer pedidos.
    /// </summary>
    [Fact]
    public async Task Handle_WithTheSwitchOff_ShouldSaveTheRowDisabled()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);
        UpsertStoreCatalogSettingsCommand command = OpenCommand();
        command.Enabled = false;

        await Handler().Handle(command, CancellationToken.None);

        _persisted!.Enabled.Should().BeFalse();
        _settingsRepository.Verify(x => x.DeleteAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>La tienda es la del CONTEXTO: una sola lectura, de esa tienda.</summary>
    [Fact]
    public async Task Handle_ShouldReadTheSettingsOfTheStoreInContext()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _settingsRepository.Verify(x => x.GetByStoreIdAsync(_storeId), Times.Once);
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.Is<Guid>(id => id != _storeId)), Times.Never);
    }

    /// <summary>
    /// El guardado va por el upsert explícito del repositorio. Un `UpdateAsync`/`AddAsync` a mano
    /// sobre una entidad cargada no escribiría nada (`ApplicationDbContext` es NoTracking) — el
    /// upsert es lo que marca la entidad.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldGoThroughTheRepositoryUpsert()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(OpenCommand(), CancellationToken.None);

        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Once);
        _settingsRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _settingsRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto no hay fila que guardar: no se adivina la tienda ni se escribe en
    /// la de otro. Se rechaza antes de tocar nada.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReject()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(OpenCommand(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>El error es de tienda no seleccionada (400), no de validación del cuerpo.</summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(OpenCommand(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    #endregion
}