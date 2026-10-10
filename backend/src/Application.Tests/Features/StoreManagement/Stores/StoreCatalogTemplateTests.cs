using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.UpdateStoreCatalogTemplate;
using Application.Features.StoreManagement.Stores.Queries.GetStoreCatalogTemplate;
using Application.UnitOfWorks;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores;

/// <summary>
/// Plantilla (vista) del catálogo por tienda, ahora SOLO SuperAdmin (`/v1/stores/{storeId}/catalog-template`).
///
///   1. Gate: SuperAdmin only, en lectura Y escritura (mismo criterio que `module-pricing`). Un
///      OwnerAdmin —o cualquiera que no sea SuperAdmin— recibe 403.
///   2. La fila por tienda se reutiliza; si no existe, se crea con sus defaults. Escribir la
///      plantilla nunca toca logo, banner, pedidos ni `PaletteId`.
///   3. Sin fila la lectura devuelve la plantilla por defecto (no un 404): una tienda recién creada
///      tiene catálogo y todavía no tiene configuración.
/// </summary>
public class StoreCatalogTemplateTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IGetStoreByIdService> _storeByIdService = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    /// <summary>Lo que realmente se pasó al repositorio, para inspeccionarlo después.</summary>
    private StoreCatalogSettings? _persisted;

    public StoreCatalogTemplateTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());

        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _settingsRepository
            .Setup(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()))
            .Returns((StoreCatalogSettings s) => Task.FromResult(s))
            .Callback<StoreCatalogSettings>(s => _persisted = s);

        Store store = Store.Create("Tienda Ana", Guid.NewGuid(), true, _tenantId, null);
        _storeByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(_storeId))
            .ReturnsAsync(store);
    }

    private UpdateStoreCatalogTemplateCommandHandler CommandHandler() => new(
        _unitOfWork.Object, _storeByIdService.Object, _settingsRepository.Object, _httpContextService.Object, _localizer.Object);

    private GetStoreCatalogTemplateQueryHandler QueryHandler() => new(
        _storeByIdService.Object, _settingsRepository.Object, _httpContextService.Object, _localizer.Object);

    private UpdateStoreCatalogTemplateCommandValidator Validator() => new(_localizer.Object);

    private StoreCatalogSettings ExistingRow()
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.Enabled = true;
        settings.WhatsappNumber = "+5350000000";
        settings.PaletteId = "sunset";
        settings.LogoKey = "old-logo.png";
        settings.BannerKey = "old-banner.png";
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);
        return settings;
    }

    #region Command

    [Fact]
    public async Task Command_WhenSuperAdmin_ShouldWriteTheTemplate()
    {
        ExistingRow();

        var result = await CommandHandler().Handle(
            new UpdateStoreCatalogTemplateCommand(_storeId, "boutique"), CancellationToken.None);

        result.Data!.TemplateId.Should().Be("boutique");
        _persisted!.TemplateId.Should().Be("boutique");
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Command_ShouldWriteTheTemplateOnlyAndPreserveTheRestOfTheRow()
    {
        ExistingRow();

        await CommandHandler().Handle(new UpdateStoreCatalogTemplateCommand(_storeId, "boutique"), CancellationToken.None);

        _persisted!.LogoKey.Should().Be("old-logo.png");
        _persisted.BannerKey.Should().Be("old-banner.png");
        _persisted.PaletteId.Should().Be("sunset");
        _persisted.Enabled.Should().BeTrue();
        _persisted.WhatsappNumber.Should().Be("+5350000000");
    }

    [Fact]
    public async Task Command_WhenTheStoreHasNoRow_ShouldCreateItWithDefaults()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await CommandHandler().Handle(
            new UpdateStoreCatalogTemplateCommand(_storeId, "boutique"), CancellationToken.None);

        result.Data!.TemplateId.Should().Be("boutique");
        _persisted!.StoreId.Should().Be(_storeId);
        _persisted.TenantId.Should().Be(_tenantId);
        _persisted.TemplateId.Should().Be("boutique");
        _persisted.Enabled.Should().BeFalse();
    }

    [Fact]
    public async Task Command_ShouldTrimTheTemplateId()
    {
        ExistingRow();

        await CommandHandler().Handle(new UpdateStoreCatalogTemplateCommand(_storeId, "  boutique  "), CancellationToken.None);

        _persisted!.TemplateId.Should().Be("boutique");
    }

    [Fact]
    public async Task Command_WhenNotSuperAdmin_ShouldForbid()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        Func<Task> act = () => CommandHandler().Handle(
            new UpdateStoreCatalogTemplateCommand(_storeId, "boutique"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    [Fact]
    public async Task Command_WhenTheStoreDoesNotExist_ShouldReportBadRequest()
    {
        _storeByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(_storeId))
            .ReturnsAsync((Store?)null);

        Func<Task> act = () => CommandHandler().Handle(
            new UpdateStoreCatalogTemplateCommand(_storeId, "boutique"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    #endregion

    #region Query

    [Fact]
    public async Task Query_WhenTheStoreHasNoRow_ShouldReturnTheDefaultTemplate()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await QueryHandler().Handle(new GetStoreCatalogTemplateQuery(_storeId), CancellationToken.None);

        result.Data!.StoreId.Should().Be(_storeId);
        result.Data.TemplateId.Should().Be(StoreCatalogSettings.DefaultTemplateId);
    }

    [Fact]
    public async Task Query_WhenTheStoreHasARow_ShouldReturnItsTemplate()
    {
        ExistingRow().TemplateId = "boutique";

        var result = await QueryHandler().Handle(new GetStoreCatalogTemplateQuery(_storeId), CancellationToken.None);

        result.Data!.TemplateId.Should().Be("boutique");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Query_WithABlankTemplate_ShouldReturnTheDefault(string blank)
    {
        ExistingRow().TemplateId = blank;

        var result = await QueryHandler().Handle(new GetStoreCatalogTemplateQuery(_storeId), CancellationToken.None);

        result.Data!.TemplateId.Should().Be(StoreCatalogSettings.DefaultTemplateId);
    }

    [Fact]
    public async Task Query_WhenNotSuperAdmin_ShouldForbid()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        Func<Task> act = () => QueryHandler().Handle(new GetStoreCatalogTemplateQuery(_storeId), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Query_WhenTheStoreDoesNotExist_ShouldReportBadRequest()
    {
        _storeByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(_storeId))
            .ReturnsAsync((Store?)null);

        Func<Task> act = () => QueryHandler().Handle(new GetStoreCatalogTemplateQuery(_storeId), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    #endregion

    #region Validator

    [Theory]
    [InlineData("default")]
    [InlineData("boutique")]
    [InlineData("market-2")]
    public void Validator_WithAKebabCaseTemplate_ShouldPass(string templateId)
    {
        Validator().Validate(new UpdateStoreCatalogTemplateCommand(_storeId, templateId))
            .IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("Boutique")]
    [InlineData("boutique two")]
    [InlineData("boutique!")]
    [InlineData("2-boutique")]
    [InlineData("-boutique")]
    [InlineData("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    public void Validator_WithAnInvalidTemplate_ShouldFail(string templateId)
    {
        var result = Validator().Validate(new UpdateStoreCatalogTemplateCommand(_storeId, templateId));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.StartsWith("BrandingInvalidTemplate", StringComparison.Ordinal));
    }

    [Fact]
    public void Validator_WithABlankTemplate_ShouldFail()
    {
        Validator().Validate(new UpdateStoreCatalogTemplateCommand(_storeId, "   "))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validator_WithAnEmptyStoreId_ShouldFail()
    {
        Validator().Validate(new UpdateStoreCatalogTemplateCommand(Guid.Empty, "boutique"))
            .IsValid.Should().BeFalse();
    }

    #endregion
}
