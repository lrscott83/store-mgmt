using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Queries.GetStoreCatalogSettings;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Leer la configuración de pedidos (la vista "Pedidos WhatsApp") tiene que comportarse bien en el
/// caso que más se va a dar: la tienda que TODAVÍA NO tiene fila. Un 404 obligaría al frontend a
/// distinguir "no configurado" de "error"; en su lugar devuelve los valores por defecto y en
/// particular `Enabled = false` — una tienda con el catálogo publicado no empieza a recibir
/// pedidos porque se le publicó la URL, sino porque el dueño lo decide.
///
/// Y lo que este DTO NO lleva: las columnas de marca. Son de F8 y de la vista Catálogo Web; que
/// aparezcan aquí haría que esta lectura se solapara con aquella.
/// </summary>
public class GetStoreCatalogSettingsQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public GetStoreCatalogSettingsQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
    }

    private GetStoreCatalogSettingsQueryHandler Handler() => new(
        _httpContextService.Object,
        _settingsRepository.Object,
        _localizer.Object);

    #region Happy Path

    /// <summary>
    /// Sin fila: los valores por defecto. `Enabled = false` es lo que la vista muestra al abrir,
    /// y lo que el storefront lee para no ofrecer pedido.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoSettings_ShouldReturnTheDefaultsWithOrdersDisabled()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Enabled.Should().BeFalse();
        result.Data.WhatsappNumber.Should().BeNull();
        result.Data.PickupEnabled.Should().BeFalse();
        result.Data.DeliveryEnabled.Should().BeFalse();
        result.Data.DeliveryFee.Should().Be(0m);
        result.Data.MinimumOrderAmount.Should().Be(0m);
        result.Data.BusinessHours.Should().BeNull();
        result.Data.DeliveryZones.Should().BeNull();
        result.Data.SyncedAt.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenTheStoreHasSettings_ShouldMapTheOrderingColumns()
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, Guid.NewGuid());
        settings.Enabled = true;
        settings.WhatsappNumber = "+5350000000";
        settings.PickupEnabled = true;
        settings.DeliveryEnabled = true;
        settings.DeliveryFee = 50m;
        settings.MinimumOrderAmount = 200m;
        settings.BusinessHours = "Lun-Vie 8:00-18:00";
        settings.DeliveryZones = "Centro, Vedado";
        settings.SyncedAt = new DateTimeOffset(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        result.Data!.Enabled.Should().BeTrue();
        result.Data.WhatsappNumber.Should().Be("+5350000000");
        result.Data.PickupEnabled.Should().BeTrue();
        result.Data.DeliveryEnabled.Should().BeTrue();
        result.Data.DeliveryFee.Should().Be(50m);
        result.Data.MinimumOrderAmount.Should().Be(200m);
        result.Data.BusinessHours.Should().Be("Lun-Vie 8:00-18:00");
        result.Data.DeliveryZones.Should().Be("Centro, Vedado");
        result.Data.SyncedAt.Should().Be(settings.SyncedAt);
    }

    /// <summary>
    /// Una tienda que synceó y luego apagó el interruptor conserva lo escrito: así el dueño vuelve
    /// a encender sin reescribir número, horarios ni zonas.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreDisabledOrders_ShouldKeepItsConfigurationAndReportDisabled()
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, Guid.NewGuid());
        settings.Enabled = false;
        settings.WhatsappNumber = "+5350000000";
        settings.PickupEnabled = true;
        settings.SyncedAt = new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero);
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        result.Data!.Enabled.Should().BeFalse();
        result.Data.WhatsappNumber.Should().Be("+5350000000");
        result.Data.PickupEnabled.Should().BeTrue();
        result.Data.SyncedAt.Should().Be(settings.SyncedAt);
    }

    /// <summary>El sello de sincronización viaja al frontend tal cual, sin convertir de zona.</summary>
    [Fact]
    public async Task Handle_ShouldReportTheSyncedAtOfTheStoredRow()
    {
        var syncedAt = new DateTimeOffset(2026, 10, 7, 12, 0, 0, TimeSpan.Zero);
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, Guid.NewGuid());
        settings.SyncedAt = syncedAt;
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        result.Data!.SyncedAt.Should().Be(syncedAt);
    }

    #endregion

    #region Integration / Dependencies

    /// <summary>La configuración es de la tienda del contexto, y se lee una sola vez.</summary>
    [Fact]
    public async Task Handle_ShouldReadTheSettingsOfTheStoreInContextOnce()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        _settingsRepository.Verify(x => x.GetByStoreIdAsync(_storeId), Times.Once);
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.Is<Guid>(id => id != _storeId)), Times.Never);
    }

    /// <summary>Es una lectura pura: no escribe ni guarda nada.</summary>
    [Fact]
    public async Task Handle_ShouldNotWriteAnything()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _settingsRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _settingsRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>
    /// El DTO de gestión no lleva la MARCA (F8): ni las claves de imagen ni la paleta. Esta
    /// lectura es de la vista Pedidos WhatsApp y no debe solaparse con la de Catálogo Web.
    /// </summary>
    [Fact]
    public void StoreCatalogSettingsDto_ShouldCarryNoBrandField()
    {
        typeof(StoreCatalogSettingsDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[] { "LogoKey", "BannerKey", "LogoUrl", "BannerUrl", "PaletteId" });
    }

    /// <summary>
    /// El DTO tampoco expone `StoreId`: la vista no lo necesita y no hay nada que pueda cambiar la
    /// tienda a la que apunta la respuesta.
    /// </summary>
    [Fact]
    public void StoreCatalogSettingsDto_ShouldCarryNoStoreIdField()
    {
        typeof(StoreCatalogSettingsDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[] { "StoreId", "TenantId", "Id" });
    }

    /// <summary>A3: la moneda no se configura en la tienda. Los precios vienen del catálogo.</summary>
    [Fact]
    public void StoreCatalogSettingsDto_ShouldCarryNoCurrencyField()
    {
        typeof(StoreCatalogSettingsDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("Currency");
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto no hay configuración que leer: no se adivina. Se rechaza antes de
    /// tocar el repositorio.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReject()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new GetStoreCatalogSettingsQuery(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    #endregion
}