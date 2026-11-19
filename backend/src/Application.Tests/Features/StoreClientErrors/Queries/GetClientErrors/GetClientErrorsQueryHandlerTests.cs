using System.Net;
using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.StoreClientErrors.Queries.GetClientErrors;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreClientErrors.Queries.GetClientErrors;

public class GetClientErrorsQueryHandlerTests
{
    private static readonly DateTime OccurredAt =
        new(2026, 11, 19, 10, 30, 0, DateTimeKind.Utc);

    private static readonly DateTime ReceivedAt =
        new(2026, 11, 19, 10, 30, 5, DateTimeKind.Utc);

    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreClientErrorRepository> _repository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public GetClientErrorsQueryHandlerTests()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        // Default: empty page, so any test that only cares about the forwarded filter still gets
        // a successful response.
        _repository
            .Setup(x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StoreClientErrorsPage([], 0));
    }

    private GetClientErrorsQueryHandler Handler() =>
        new(_httpContextService.Object, _repository.Object, _localizer.Object);

    [Fact]
    public async Task Handle_NonSuperAdmin_ThrowsForbidden()
    {
        // Arrange
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        // Act
        var act = () => Handler().Handle(new GetClientErrorsQuery(), CancellationToken.None);

        // Assert
        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _repository.Verify(
            x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WithFilters_ForwardsOwnerStoreAndDateRangeToRepository()
    {
        // Arrange
        Guid? ownerId = Guid.NewGuid();
        Guid? storeId = Guid.NewGuid();
        DateTime? from = new DateTime(2026, 11, 19, 5, 0, 0, DateTimeKind.Utc);
        DateTime? to = new DateTime(2026, 11, 20, 4, 59, 59, DateTimeKind.Utc);

        StoreClientErrorsFilter? forwarded = null;
        _repository
            .Setup(x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()))
            .Callback<StoreClientErrorsFilter, CancellationToken>((filter, _) => forwarded = filter)
            .ReturnsAsync(new StoreClientErrorsPage([], 0));

        // Act
        await Handler().Handle(
            new GetClientErrorsQuery(ownerId, storeId, from, to), CancellationToken.None);

        // Assert
        forwarded.Should().NotBeNull();
        forwarded!.OwnerId.Should().Be(ownerId);
        forwarded.StoreId.Should().Be(storeId);
        forwarded.From.Should().Be(from);
        forwarded.To.Should().Be(to);
    }

    [Fact]
    public async Task Handle_PageSizeAboveMaximum_ClampsTo200()
    {
        // Arrange
        StoreClientErrorsFilter? forwarded = null;
        _repository
            .Setup(x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()))
            .Callback<StoreClientErrorsFilter, CancellationToken>((filter, _) => forwarded = filter)
            .ReturnsAsync(new StoreClientErrorsPage([], 0));

        // Act
        var result = await Handler().Handle(
            new GetClientErrorsQuery(Page: 1, PageSize: 500), CancellationToken.None);

        // Assert
        forwarded.Should().NotBeNull();
        forwarded!.PageSize.Should().Be(200);
        result.Succeeded.Should().BeTrue();
        result.Data.PageSize.Should().Be(200);
    }

    [Fact]
    public async Task Handle_PageBelowOne_ClampsTo1()
    {
        // Arrange
        StoreClientErrorsFilter? forwarded = null;
        _repository
            .Setup(x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()))
            .Callback<StoreClientErrorsFilter, CancellationToken>((filter, _) => forwarded = filter)
            .ReturnsAsync(new StoreClientErrorsPage([], 0));

        // Act
        var result = await Handler().Handle(
            new GetClientErrorsQuery(Page: 0), CancellationToken.None);

        // Assert
        forwarded.Should().NotBeNull();
        forwarded!.Page.Should().Be(1);
        result.Data.Page.Should().Be(1);
    }

    [Fact]
    public async Task Handle_RowWithoutStore_ReturnsNullOwnerAndStoreNames()
    {
        // Arrange
        var row = new StoreClientErrorRow(
            Id: Guid.NewGuid(),
            StoreId: null,
            OwnerName: null,
            StoreName: null,
            Message: "Login failed before session",
            Route: "/login",
            Location: "app/login.tsx:88",
            Count: 2,
            Context: "{\"reason\":\"device-key\"}",
            AppVersion: "1.4.2",
            Device: "Android 14 / POS-01",
            OccurredAt: OccurredAt,
            ReceivedAt: ReceivedAt);

        _repository
            .Setup(x => x.GetPageAsync(It.IsAny<StoreClientErrorsFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StoreClientErrorsPage([row], 1));

        // Act
        var result = await Handler().Handle(new GetClientErrorsQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.TotalCount.Should().Be(1);
        result.Data.Items.Should().ContainSingle();
        result.Data.Items[0].OwnerName.Should().BeNull();
        result.Data.Items[0].StoreName.Should().BeNull();
        result.Data.Items[0].StoreId.Should().BeNull();
        result.Data.Items[0].Message.Should().Be("Login failed before session");
        result.Data.Items[0].Count.Should().Be(2);
        result.Data.Items[0].OccurredAt.Should().Be(OccurredAt);
    }
}
