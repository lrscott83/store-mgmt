using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Sync;
using Domain.Common.Enums;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using System.Linq.Expressions;

namespace Application.Tests.Features.WebCatalog.Sync;

/// <summary>
/// Tercera fase del espejo del catálogo: los escalones mayoristas. El POS es el dueño de los
/// datos, así que la sincronización reemplaza el conjunto del producto — pero solo cuando el
/// snapshot HABLA de él:
///
///   - una lista con cambios se reemplaza (borrar + insertar),
///   - la misma lista no se toca (re-sincronizar no debe borrar e insertar lo mismo),
///   - una lista vacía significa "no hay escalones" y deja la tabla limpia,
///   - `null` significa "el snapshot no habla de los escalones" (un bundle viejo del POS o un
///     snapshot parcial) y la tabla se queda como está.
///
/// El último caso es la regresión R1-1: con `?? []` un cliente viejo borraba todos los escalones
/// de la tienda y la respuesta decía "sincronizado".
/// </summary>
public class CatalogMirrorWriterWholesaleTiersTests
{
    private static readonly Guid TenantId = Guid.NewGuid();

    private readonly Mock<IProductWholesaleTierRepository> _tierRepository = new();
    private readonly List<ProductWholesaleTier> _added = new();

    public CatalogMirrorWriterWholesaleTiersTests()
    {
        _tierRepository
            .Setup(repository => repository.AddRangeAsync(It.IsAny<IEnumerable<ProductWholesaleTier>>()))
            .Callback<IEnumerable<ProductWholesaleTier>>(rows => _added.AddRange(rows))
            .Returns(Task.CompletedTask);

        _tierRepository
            .Setup(repository => repository.HardDeleteWhereAsync(It.IsAny<Expression<Func<ProductWholesaleTier, bool>>>()))
            .ReturnsAsync(1);
    }

    #region Replacement only when the snapshot speaks

    /// <summary>Un conjunto distinto reemplaza al guardado: se borra lo viejo y se inserta lo nuevo.</summary>
    [Fact]
    public async Task MirrorWholesaleTiersAsync_WhenTiersChanged_ReplacesTheStoredSet()
    {
        Guid productId = Guid.NewGuid();
        Product product = ProductWithStoredTiers(productId, Tier(productId, 1, 10m, Currency.CUP));
        var snapshot = Snapshot(productId, new List<CatalogSnapshotWholesaleTierDto>
        {
            TierDto(1, 12m, (int)Currency.CUP),
            TierDto(3, 9m, (int)Currency.CUP),
        });

        await CatalogMirrorWriter.MirrorWholesaleTiersAsync(snapshot, new[] { product }, _tierRepository.Object);

        DeleteCalled().Should().BeTrue("el conjunto guardado ya no sirve");
        _added.Should().HaveCount(2);
        _added.Select(tier => tier.MinPacks).Should().BeEquivalentTo(new[] { 1, 3 });
        _added.Single(tier => tier.MinPacks == 1).PricePerUnit.Should().Be(12m);
    }

    /// <summary>La misma lista no se reescribe: re-sincronizar no borra e inserta lo mismo.</summary>
    [Fact]
    public async Task MirrorWholesaleTiersAsync_WhenTiersUnchanged_DoesNothing()
    {
        Guid productId = Guid.NewGuid();
        Product product = ProductWithStoredTiers(productId, Tier(productId, 1, 10m, Currency.CUP), Tier(productId, 3, 9m, Currency.CUP));
        var snapshot = Snapshot(productId, new List<CatalogSnapshotWholesaleTierDto>
        {
            TierDto(1, 10m, (int)Currency.CUP),
            TierDto(3, 9m, (int)Currency.CUP),
        });

        await CatalogMirrorWriter.MirrorWholesaleTiersAsync(snapshot, new[] { product }, _tierRepository.Object);

        DeleteCalled().Should().BeFalse("el conjunto no cambió");
        _added.Should().BeEmpty();
    }

    /// <summary>Lista vacía = "no hay escalones": se borran los guardados y no se inserta nada.</summary>
    [Fact]
    public async Task MirrorWholesaleTiersAsync_WhenTiersEmpty_ClearsTheStoredSet()
    {
        Guid productId = Guid.NewGuid();
        Product product = ProductWithStoredTiers(productId, Tier(productId, 1, 10m, Currency.CUP));
        var snapshot = Snapshot(productId, new List<CatalogSnapshotWholesaleTierDto>());

        await CatalogMirrorWriter.MirrorWholesaleTiersAsync(snapshot, new[] { product }, _tierRepository.Object);

        DeleteCalled().Should().BeTrue("el snapshot dice que no hay escalones");
        _added.Should().BeEmpty();
    }

    /// <summary>
    /// R1-1: `null` es "el snapshot no habla de los escalones". Un bundle viejo del POS (o un
    /// snapshot parcial) no debe borrar los escalones guardados ni insertar nada.
    /// </summary>
    [Fact]
    public async Task MirrorWholesaleTiersAsync_WhenTiersNull_LeavesTheStoredSetUntouched()
    {
        Guid productId = Guid.NewGuid();
        Product product = ProductWithStoredTiers(productId, Tier(productId, 1, 10m, Currency.CUP));
        var snapshot = Snapshot(productId, wholesaleTiers: null);

        await CatalogMirrorWriter.MirrorWholesaleTiersAsync(snapshot, new[] { product }, _tierRepository.Object);

        DeleteCalled().Should().BeFalse("ausente no significa 'no hay': el snapshot no habla de los escalones");
        _added.Should().BeEmpty();
    }

    #endregion

    #region Currency resolution

    /// <summary>
    /// La moneda del escalón es la del escalón cuando viene; si no, la del producto. El precio del
    /// pedido se cobra en esa moneda, así que resolverla mal cambia el importe real.
    /// </summary>
    [Fact]
    public async Task MirrorWholesaleTiersAsync_ResolvesTierCurrencyFallingBackToTheProductCurrency()
    {
        Guid productId = Guid.NewGuid();
        Product product = ProductWithStoredTiers(productId);
        CatalogSnapshotDto snapshot = Snapshot(productId, new List<CatalogSnapshotWholesaleTierDto>
        {
            TierDto(1, 10m, currency: null),
            TierDto(5, 9m, (int)Currency.EUR),
        }, productCurrency: (int)Currency.USD);

        await CatalogMirrorWriter.MirrorWholesaleTiersAsync(snapshot, new[] { product }, _tierRepository.Object);

        _added.Should().HaveCount(2);
        _added.Single(tier => tier.MinPacks == 1).Currency.Should().Be(Currency.USD,
            "el escalón no trae moneda y hereda la del producto");
        _added.Single(tier => tier.MinPacks == 5).Currency.Should().Be(Currency.EUR,
            "la moneda propia del escalón gana sobre la del producto");
    }

    #endregion

    #region Defensive skips (R3)

    /// <summary>
    /// Un producto que el snapshot lista pero que la fase 1 no resolvió no tiene filas que tocar:
    /// el espejo lo SALTA en silencio. Es defensivo — ambas fases leen el mismo snapshot, así que
    /// en el flujo normal no ocurre — pero un fallo aquí borraría escalones de un producto que la
    /// sincronización ni siquiera reconoció.
    /// </summary>
    [Fact]
    public async Task MirrorWholesaleTiersAsync_WhenTheProductWasNotResolved_SkipsItSilently()
    {
        Guid productId = Guid.NewGuid();
        var snapshot = Snapshot(productId, new List<CatalogSnapshotWholesaleTierDto> { TierDto(2, 9m, null) });

        await CatalogMirrorWriter.MirrorWholesaleTiersAsync(snapshot, Array.Empty<Product>(), _tierRepository.Object);

        _added.Should().BeEmpty("no hay producto al que colgarle los escalones");
        DeleteCalled().Should().BeFalse("no se borra nada de un producto que no se resolvió");
    }

    /// <summary>
    /// Un escalón con <c>MinPacks</c> no positivo no es un escalón vendible: el validador ya lo
    /// rechaza con un 400, y el escritor lo filtra igual para que una entrada que llegue por otra
    /// vía no inserte una fila que la regla de precio nunca va a elegir.
    /// </summary>
    [Fact]
    public async Task MirrorWholesaleTiersAsync_WhenATierHasNonPositiveMinPacks_IgnoresIt()
    {
        Guid productId = Guid.NewGuid();
        Product product = ProductWithStoredTiers(productId);
        var snapshot = Snapshot(productId, new List<CatalogSnapshotWholesaleTierDto>
        {
            TierDto(0, 5m, null),
            TierDto(2, 9m, null),
        });

        await CatalogMirrorWriter.MirrorWholesaleTiersAsync(snapshot, new[] { product }, _tierRepository.Object);

        _added.Should().ContainSingle("solo el escalón con mínimo positivo es vendible")
            .Which.MinPacks.Should().Be(2);
    }

    #endregion

    private bool DeleteCalled()
    {
        try
        {
            _tierRepository.Verify(
                repository => repository.HardDeleteWhereAsync(It.IsAny<Expression<Func<ProductWholesaleTier, bool>>>()),
                Times.AtLeastOnce());
            return true;
        }
        catch (MockException)
        {
            return false;
        }
    }

    private static CatalogSnapshotDto Snapshot(Guid productId,
        List<CatalogSnapshotWholesaleTierDto>? wholesaleTiers,
        int? productCurrency = (int)Currency.CUP)
    {
        return new CatalogSnapshotDto
        {
            Products =
            {
                new CatalogSnapshotProductDto
                {
                    Id = productId,
                    CategoryId = Guid.NewGuid(),
                    Name = "Cerveza",
                    Price = 100m,
                    Currency = productCurrency,
                    WholesaleTiers = wholesaleTiers,
                },
            },
        };
    }

    private static Product ProductWithStoredTiers(Guid productId, params ProductWholesaleTier[] tiers)
    {
        Product product = Product.Create(productId, "Cerveza", Guid.NewGuid(), 100m, 0, true, true, "B1", TenantId);
        foreach (ProductWholesaleTier tier in tiers)
            product.WholesaleTiers.Add(tier);
        return product;
    }

    private static ProductWholesaleTier Tier(Guid productId, int minPacks, decimal pricePerUnit, Currency currency)
        => ProductWholesaleTier.Create(productId, minPacks, pricePerUnit, currency, TenantId);

    private static CatalogSnapshotWholesaleTierDto TierDto(int minPacks, decimal pricePerUnit, int? currency)
        => new() { MinPacks = minPacks, PricePerUnit = pricePerUnit, Currency = currency };
}
