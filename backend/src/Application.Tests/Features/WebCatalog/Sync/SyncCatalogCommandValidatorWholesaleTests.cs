using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Sync;
using Application.Features.WebCatalog.Sync.Commands.SyncCatalog;
using Domain.Common.Limits;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Sync;

/// <summary>
/// Rutas de rechazo del snapshot mayorista. El snapshot lo arma el POS, así que cada regla existe
/// para convertir un snapshot inválido en un 400 con mensaje en vez de en un 500 de base de datos
/// (el índice UNIQUE de `(ProductId, MinPacks)`) o en un precio ambiguo.
///
/// Todas las pruebas comprueban que la validación NO lanza: una excepción aquí es el 500 que las
/// reglas quieren evitar.
/// </summary>
public class SyncCatalogCommandValidatorWholesaleTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public SyncCatalogCommandValidatorWholesaleTests()
    {
        // Sin estos stubs el indexador devuelve `null` y `WithMessage(null)` revienta al CONSTRUIR
        // el validador, no al validar.
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns<string>(name => new LocalizedString(name, name));
    }

    private SyncCatalogCommandValidator Validator() => new(_localizer.Object);

    #region Happy path

    /// <summary>Un snapshot sin config mayorista (bundle viejo del POS) es válido: todo es `null`.</summary>
    [Fact]
    public void Validate_WithNoWholesaleFacts_ShouldPass()
    {
        Validator().Validate(Command()).IsValid.Should().BeTrue();
    }

    /// <summary>Una config mayorista coherente pasa entera.</summary>
    [Fact]
    public void Validate_WithAValidWholesaleConfig_ShouldPass()
    {
        var result = Validator().Validate(Command(wholesalePackSize: 12, unitLabel: "caja",
            tiers: new() { Tier(1, 10m), Tier(6, 9m) }));

        result.IsValid.Should().BeTrue();
    }

    #endregion

    #region Rejection paths

    /// <summary>Dos escalones con el mismo mínimo chocan con el índice UNIQUE y son ambiguos.</summary>
    [Fact]
    public void Validate_WithDuplicateMinPacks_ShouldFail()
    {
        var result = Validator().Validate(Command(tiers: new() { Tier(1, 10m), Tier(1, 9m) }));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage.StartsWith("CatalogWholesaleDuplicateMinPacks", StringComparison.Ordinal));
    }

    /// <summary>Un tamaño de paquete negativo no tiene sentido físico.</summary>
    [Fact]
    public void Validate_WithNegativeWholesalePackSize_ShouldFail()
    {
        var result = Validator().Validate(Command(wholesalePackSize: -1));

        result.IsValid.Should().BeFalse();
    }

    /// <summary>La unidad es texto libre pero acotado: va en una columna y sale en el catálogo.</summary>
    [Fact]
    public void Validate_WithUnitLabelOverTheLimit_ShouldFail()
    {
        string label = new('x', ProductEntityLimits.WholesaleUnitLabelMaxLength + 1);

        var result = Validator().Validate(Command(unitLabel: label));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage.StartsWith("CatalogWholesaleUnitLabelTooLong", StringComparison.Ordinal));
    }

    /// <summary>Más escalones que el tope es defensa contra un snapshot que manda megabytes.</summary>
    [Fact]
    public void Validate_WithMoreTiersThanTheLimit_ShouldFail()
    {
        var tiers = Enumerable.Range(1, CatalogMirrorWriter.MaxWholesaleTiers + 1)
            .Select(minPacks => Tier(minPacks, 10m))
            .ToList();

        var result = Validator().Validate(Command(tiers: tiers));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage.StartsWith("CatalogWholesaleTiersLimit", StringComparison.Ordinal));
    }

    /// <summary>Un mínimo de cero paquetes no es un escalón: nunca se alcanza.</summary>
    [Fact]
    public void Validate_WithNonPositiveMinPacks_ShouldFail()
    {
        var result = Validator().Validate(Command(tiers: new() { Tier(0, 10m) }));

        result.IsValid.Should().BeFalse();
    }

    /// <summary>Un precio por unidad de cero o negativo es un precio inválido.</summary>
    [Fact]
    public void Validate_WithNonPositivePricePerUnit_ShouldFail()
    {
        var result = Validator().Validate(Command(tiers: new() { Tier(1, 0m) }));

        result.IsValid.Should().BeFalse();
    }

    /// <summary>
    /// Un elemento `null` dentro del array es un 400, no el 500 que produciría dereferenciarlo.
    /// </summary>
    [Fact]
    public void Validate_WithANullTierElement_ShouldFailWithoutThrowing()
    {
        var command = Command(tiers: new() { null!, Tier(1, 10m) });

        var act = () => Validator().Validate(command);

        act.Should().NotThrow();
        var result = act();
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage.StartsWith("CatalogWholesaleTierRequired", StringComparison.Ordinal));
    }

    #endregion

    private static readonly Guid CategoryId = Guid.NewGuid();

    private static SyncCatalogCommand Command(int? wholesalePackSize = null, string? unitLabel = null,
        List<CatalogSnapshotWholesaleTierDto?>? tiers = null)
        => new(new CatalogSnapshotDto
        {
            Categories = { new CatalogSnapshotCategoryDto { Id = CategoryId, Name = "Bebidas" } },
            Products = { Product(wholesalePackSize, unitLabel, tiers) },
        });

    private static CatalogSnapshotProductDto Product(int? wholesalePackSize = null, string? unitLabel = null,
        List<CatalogSnapshotWholesaleTierDto?>? tiers = null)
        => new()
        {
            Id = Guid.NewGuid(),
            CategoryId = CategoryId,
            Name = "Cerveza",
            Price = 100m,
            WholesalePackSize = wholesalePackSize,
            WholesaleUnitLabel = unitLabel,
            WholesaleTiers = tiers,
        };

    private static CatalogSnapshotWholesaleTierDto Tier(int minPacks, decimal pricePerUnit)
        => new() { MinPacks = minPacks, PricePerUnit = pricePerUnit };
}
