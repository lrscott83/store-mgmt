using Application.Abstractions.HttpContext;
using Application.Features.StoreClientErrors.Queries.GetClientErrors;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreClientErrors.Queries.GetClientErrors;

/// <summary>
/// Límites del panel SuperAdmin (spec S6): el recorte de `page`/`pageSize` que hace el handler y la
/// conversión a UTC de las cotas del filtro (spec S7). Complementa
/// <see cref="GetClientErrorsQueryHandlerTests"/> sin tocarlo.
/// </summary>
public class GetClientErrorsQueryHandlerLimitsTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreClientErrorRepository> _repository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private StoreClientErrorsFilter? _forwarded;

    public GetClientErrorsQueryHandlerLimitsTests()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        // Default: empty page, so every test only has to override what it asserts.
        _repository
            .Setup(x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StoreClientErrorsPage([], 0));
    }

    private GetClientErrorsQueryHandler Handler() =>
        new(_httpContextService.Object, _repository.Object, _localizer.Object);

    /// <summary>Captura el filtro real que el handler entrega al repositorio.</summary>
    private void CaptureForwardedFilter()
    {
        _repository
            .Setup(x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()))
            .Callback<StoreClientErrorsFilter, CancellationToken>((filter, _) => _forwarded = filter)
            .ReturnsAsync(new StoreClientErrorsPage([], 0));
    }

    #region Page / pageSize clamps

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-500)]
    public async Task Handle_PageSizeBelowOne_ClampsTo1(int pageSize)
    {
        // Arrange
        CaptureForwardedFilter();

        // Act
        var result = await Handler().Handle(
            new GetClientErrorsQuery(PageSize: pageSize), CancellationToken.None);

        // Assert
        _forwarded.Should().NotBeNull();
        _forwarded!.PageSize.Should().Be(1);
        result.Data.PageSize.Should().Be(1);
    }

    [Fact]
    public async Task Handle_PageAboveTheMaximum_ClampsToTheDocumentedMaxPage()
    {
        // Arrange
        CaptureForwardedFilter();

        // Act — the largest value an accepted `page` can reach; unclamped it overflows
        // `(page - 1) * pageSize` in the repository.
        var result = await Handler().Handle(
            new GetClientErrorsQuery(Page: int.MaxValue, PageSize: 200), CancellationToken.None);

        // Assert
        _forwarded.Should().NotBeNull();
        _forwarded!.Page.Should().Be(StoreClientErrorsPagination.MaxPage);
        result.Data.Page.Should().Be(StoreClientErrorsPagination.MaxPage);

        // The offset the repository computes from these two values must still fit in an int.
        long offset = ((long)_forwarded.Page - 1) * _forwarded.PageSize;
        offset.Should().BeGreaterThan(0);
        offset.Should().BeLessThan(int.MaxValue);
    }

    [Fact]
    public async Task Handle_PageWithinTheRange_ForwardsItUnchanged()
    {
        // Arrange
        CaptureForwardedFilter();

        // Act
        var result = await Handler().Handle(
            new GetClientErrorsQuery(Page: 3, PageSize: 25), CancellationToken.None);

        // Assert
        _forwarded.Should().NotBeNull();
        _forwarded!.Page.Should().Be(3);
        _forwarded.PageSize.Should().Be(25);
        result.Data.Page.Should().Be(3);
        result.Data.PageSize.Should().Be(25);
    }

    #endregion

    #region UTC bound conversion (S7)

    [Fact]
    public void ToUtc_WithUnspecifiedKind_TreatsTheWallClockAsUtc()
    {
        // Arrange — this is what the client contract sends for an ISO instant that arrives
        // without an offset; the wall clock IS the UTC instant.
        var unspecified = new DateTime(2026, 11, 19, 10, 30, 0, DateTimeKind.Unspecified);

        // Act
        DateTime result = StoreClientErrorsDateBounds.ToUtc(unspecified);

        // Assert
        result.Kind.Should().Be(DateTimeKind.Utc);
        result.Should().Be(unspecified);
    }

    [Fact]
    public void ToUtc_WithUtcKind_LeavesTheValueUntouched()
    {
        // Arrange
        var utc = new DateTime(2026, 11, 19, 10, 30, 0, DateTimeKind.Utc);

        // Act
        DateTime result = StoreClientErrorsDateBounds.ToUtc(utc);

        // Assert
        result.Should().Be(utc);
        result.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public void ToUtc_WithLocalKind_ConvertsTheInstantInsteadOfRelabellingIt()
    {
        // Arrange
        var local = new DateTime(2026, 11, 19, 10, 30, 0, DateTimeKind.Local);
        DateTime expected = new DateTimeOffset(local).UtcDateTime;

        // Act
        DateTime result = StoreClientErrorsDateBounds.ToUtc(local);

        // Assert — the instant denoted by the Local value survives the conversion.
        result.Kind.Should().Be(DateTimeKind.Utc);
        result.Should().Be(expected);

        // A relabel (SpecifyKind) keeps the wall clock; it is only indistinguishable from a real
        // conversion when the machine offset is zero, so the discriminating check is conditional.
        if (TimeZoneInfo.Local.GetUtcOffset(local) != TimeSpan.Zero)
            result.Should().NotBe(DateTime.SpecifyKind(local, DateTimeKind.Utc));
    }

    #endregion
}
