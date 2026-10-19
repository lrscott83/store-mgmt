using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.UpdateStoreCatalogSlug;
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
/// Slug público (`/catalog/&lt;slug&gt;`) del catálogo por tienda
/// (`PUT /v1/stores/{storeId}/catalog-slug`), SuperAdmin only.
///
///   1. Gate: SuperAdmin only, como `catalog-template`. Cualquiera que no sea SuperAdmin, 403.
///   2. El valor se NORMALIZA (`SlugNormalizer`): mayúsculas, tildes y espacios no son un error de
///      entrada, son parte de un slug inequívoco.
///   3. Colisión con OTRA tienda → 409 sin escribir. El mismo slug que la tienda ya tiene es válido.
///   4. El slug se escribe en `Store.CatalogSlug` (no en la fila de configuración) y es lo único
///      que el endpoint toca.
/// </summary>
public class StoreCatalogSlugTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IGetStoreByIdService> _storeByIdService = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    /// <summary>La tienda que el repositorio devuelve (la misma instancia que se muta).</summary>
    private Store _store = null!;

    /// <summary>El valor realmente pasado a `UpdateAsync`, para inspeccionarlo después.</summary>
    private Store? _persisted;

    public StoreCatalogSlugTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _storeRepository
            .Setup(x => x.UpdateAsync(It.IsAny<Store>()))
            .Returns((Store store) =>
            {
                _persisted = store;
                return Task.FromResult(true);
            });

        _store = Store.Create("Tienda Ana", Guid.NewGuid(), true, _tenantId, null);
        _storeRepository.Setup(x => x.GetStoreByIdAsync(_storeId)).ReturnsAsync(_store);
        _storeRepository.Setup(x => x.GetCatalogSlugsAsync()).ReturnsAsync(Array.Empty<string>());

        // Lectura combinada (plantilla + slug): la fila de configuración puede no existir.
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);
        _storeByIdService.Setup(x => x.GetStoreByIdIncludingModulesAsync(_storeId)).ReturnsAsync(() => _store);
    }

    private UpdateStoreCatalogSlugCommandHandler CommandHandler() => new(
        _unitOfWork.Object, _storeRepository.Object, _httpContextService.Object, _localizer.Object);

    private UpdateStoreCatalogSlugCommandValidator Validator() => new(_localizer.Object);

    private GetStoreCatalogTemplateQueryHandler QueryHandler() => new(
        _storeByIdService.Object, _settingsRepository.Object, _httpContextService.Object, _localizer.Object);

    [Theory]
    [InlineData("Café & Té", "cafe-te")]
    [InlineData("Ñoño ÑÁÉÍÓÚ", "nono-naeiou")]
    [InlineData("  Mi Tienda  ", "mi-tienda")]
    [InlineData("Ropa--de---niño", "ropa-de-nino")]
    public async Task Command_ShouldNormalizeTheSlugBeforeSaving(string input, string expected)
    {
        var result = await CommandHandler().Handle(
            new UpdateStoreCatalogSlugCommand(_storeId, input), CancellationToken.None);

        result.Data!.CatalogSlug.Should().Be(expected);
        _persisted!.CatalogSlug.Should().Be(expected);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Command_WhenTheStoreAlreadyHasThatSlug_ShouldBeAllowed()
    {
        // Guardar el MISMO slug es un no-op válido: no colisiona consigo misma, aunque la lista de
        // slugs tomados (que incluye el propio) lo contenga.
        _store.CatalogSlug = "tienda-ana";
        _storeRepository.Setup(x => x.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "tienda-ana" });

        var result = await CommandHandler().Handle(
            new UpdateStoreCatalogSlugCommand(_storeId, "tienda-ana"), CancellationToken.None);

        result.Data!.CatalogSlug.Should().Be("tienda-ana");
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Command_WhenAnotherStoreAlreadyUsesTheSlug_ShouldConflictAndNotWrite()
    {
        _storeRepository.Setup(x => x.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "otra-tienda" });

        Func<Task> act = () => CommandHandler().Handle(
            new UpdateStoreCatalogSlugCommand(_storeId, "Otra Tienda"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Conflict);
        _store.CatalogSlug.Should().BeNull();
        _storeRepository.Verify(x => x.UpdateAsync(It.IsAny<Store>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Command_WhenNotSuperAdmin_ShouldForbid()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        Func<Task> act = () => CommandHandler().Handle(
            new UpdateStoreCatalogSlugCommand(_storeId, "tienda-ana"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
        _storeRepository.Verify(x => x.UpdateAsync(It.IsAny<Store>()), Times.Never);
    }

    [Fact]
    public async Task Command_WhenTheStoreDoesNotExist_ShouldReportBadRequest()
    {
        _storeRepository.Setup(x => x.GetStoreByIdAsync(_storeId)).ReturnsAsync((Store?)null);

        Func<Task> act = () => CommandHandler().Handle(
            new UpdateStoreCatalogSlugCommand(_storeId, "tienda-ana"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Validator_WithABlankSlug_ShouldFail(string blank)
    {
        Validator().Validate(new UpdateStoreCatalogSlugCommand(_storeId, blank))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validator_WithANonBlankSlug_ShouldPass()
    {
        // El formato NO es asunto del validador: el handler normaliza.
        Validator().Validate(new UpdateStoreCatalogSlugCommand(_storeId, "Café & Té"))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_WithAnEmptyStoreId_ShouldFail()
    {
        Validator().Validate(new UpdateStoreCatalogSlugCommand(Guid.Empty, "tienda-ana"))
            .IsValid.Should().BeFalse();
    }

    // ── Lectura combinada (S5): el editor del SuperAdmin es UN modal, así que la lectura de la
    //    plantilla trae también el slug. ────────────────────────────────────────────────────────

    [Fact]
    public async Task Query_ShouldReturnTheStoreCatalogSlug()
    {
        _store.CatalogSlug = "tienda-ana";

        var result = await QueryHandler().Handle(new GetStoreCatalogTemplateQuery(_storeId), CancellationToken.None);

        result.Data!.CatalogSlug.Should().Be("tienda-ana");
    }

    [Fact]
    public async Task Query_WhenTheStoreHasNoSlugYet_ShouldReturnEmpty()
    {
        // Una tienda que nunca sincronizó su catálogo no tiene URL pública todavía.
        var result = await QueryHandler().Handle(new GetStoreCatalogTemplateQuery(_storeId), CancellationToken.None);

        result.Data!.CatalogSlug.Should().BeEmpty();
    }
}
