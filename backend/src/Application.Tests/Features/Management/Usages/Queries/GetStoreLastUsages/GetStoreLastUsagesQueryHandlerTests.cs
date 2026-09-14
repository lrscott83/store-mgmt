using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.Features.Management.Usages.Queries.GetStoreLastWeekUsages;
using AutoMapper;
using Domain.Entities.Owners;
using Domain.Entities.StoreUsages;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.Management.Usages.Queries.GetStoreLastUsages;

/// <summary>
/// Unit tests for GetStoreLastWeekUsagesQueryHandler (dashboard del superadmin).
/// Contract: the response has EXACTLY LastDays buckets — one per calendar day from
/// (UtcToday - (LastDays-1)) to UtcToday inclusive — with an explicit 0 (and an
/// empty owners list) for any day without usage rows. No left-padding shift, so
/// the frontend maps buckets 1:1 onto day labels.
/// </summary>
public class GetStoreLastUsagesQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContext = new();
    private readonly Mock<IStoreUsageRepository> _usageRepo = new();
    private readonly Mock<IStoreRepository> _storeRepo = new();
    private readonly Mock<IMapper> _mapper = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<IDateTimeProvider> _dateTime = new();

    private static readonly DateTimeOffset FixedNow = new(2026, 9, 14, 15, 30, 0, TimeSpan.Zero);

    public GetStoreLastUsagesQueryHandlerTests()
    {
        _httpContext.Setup(x => x.IsSuperAdmin).Returns(true);
        _localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "UserNotFound"));
        _dateTime.Setup(x => x.UtcNow).Returns(FixedNow);
    }

    private GetStoreLastWeekUsagesQueryHandler CreateHandler()
        => new(
            _httpContext.Object,
            _usageRepo.Object,
            _mapper.Object,
            _localizer.Object,
            _storeRepo.Object,
            _dateTime.Object);

    // ── Builders ─────────────────────────────────────────────────────────

    private static Owner CreateOwner(Guid ownerUserId)
    {
        var owner = Owner.Create(ownerUserId, guest: false, Guid.NewGuid(), "Owner Test");
        var user = User.Create(ownerUserId, "owner", "pass", "Owner User", null, null, Guid.NewGuid());
        user.IsActive = true;
        owner.User = user;
        return owner;
    }

    private static Store CreateStore()
    {
        var store = Store.Create("Test Store", Guid.NewGuid(), true, Guid.NewGuid(), null);
        store.IsActive = true;
        store.Owner = CreateOwner(Guid.NewGuid());
        return store;
    }

    private static StoreUsage CreateUsage(Store store, DateTime day)
    {
        var usage = StoreUsage.Create(store.Id, Guid.NewGuid(), DateTime.SpecifyKind(day, DateTimeKind.Utc), "", "", "", "");
        usage.Store = store;
        return usage;
    }

    private void ArrangeUsages(params StoreUsage[] usages)
        => _usageRepo
            .Setup(x => x.GetStoresUsagesAfterDateWithOwnerAsync(It.IsAny<DateTime>()))
            .ReturnsAsync(usages);

    // ── Contract: dense buckets ──────────────────────────────────────────

    [Fact]
    public async Task Handle_last7_returnsExactly7Buckets_evenWhenOnlyTodayHasData()
    {
        // Arrange: a single usage TODAY (the "gap" case that used to shift everything).
        var store = CreateStore();
        var today = FixedNow.UtcDateTime.Date;
        ArrangeUsages(CreateUsage(store, today));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        var dto = result.Data!;
        dto.StoreUsagesCountDays.Should().HaveCount(7);
        dto.OwnerNamesPerDay.Should().HaveCount(7);

        // Last bucket = today = 1 usage; all previous days = 0.
        dto.StoreUsagesCountDays[6].Should().Be(1);
        dto.StoreUsagesCountDays.Take(6).Should().OnlyContain(c => c == 0);
        dto.OwnerNamesPerDay[6].Should().ContainSingle().Which.Should().Be("Owner User");
        dto.OwnerNamesPerDay.Take(6).Should().OnlyContain(l => l.Count == 0);
    }

    [Fact]
    public async Task Handle_last7_zeroesIncludeToday_whenNobodyUsedTheApp()
    {
        // Arrange: the Monday-morning case — last usage was yesterday, today empty.
        var store = CreateStore();
        var yesterday = FixedNow.UtcDateTime.Date.AddDays(-1);
        ArrangeUsages(CreateUsage(store, yesterday));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        var dto = result.Data!;
        dto.StoreUsagesCountDays.Should().HaveCount(7);
        // Last bucket (today) = 0; second-to-last (yesterday) = 1.
        dto.StoreUsagesCountDays[6].Should().Be(0, "an empty today must NOT receive yesterday's count");
        dto.StoreUsagesCountDays[5].Should().Be(1);
        dto.OwnerNamesPerDay[5].Should().ContainSingle().Which.Should().Be("Owner User");
        dto.OwnerNamesPerDay[6].Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_last7_windowCoversExactly7CalendarDays()
    {
        // Arrange: usage 6 days back (first bucket) must count; 7 days back must NOT.
        var store = CreateStore();
        var today = FixedNow.UtcDateTime.Date;
        var inWindow = CreateUsage(store, today.AddDays(-6));
        var outOfWindow = CreateUsage(store, today.AddDays(-7));

        DateTime capturedCutoff = default;
        _usageRepo
            .Setup(x => x.GetStoresUsagesAfterDateWithOwnerAsync(It.IsAny<DateTime>()))
            .Callback<DateTime>(d => capturedCutoff = d)
            .ReturnsAsync(new[] { inWindow, outOfWindow });

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7), CancellationToken.None);

        // Assert: the repository must be asked for exactly today-(7-1) = today-6.
        capturedCutoff.Should().Be(today.AddDays(-6));

        var dto = result.Data!;
        dto.StoreUsagesCountDays.Should().HaveCount(7);
        dto.StoreUsagesCountDays[0].Should().Be(1, "today-6 is the first bucket");
        dto.StoreUsagesCountDays[1].Should().Be(0, "today-7 is outside the dense window");
        dto.StoreUsagesCountDays.Sum().Should().Be(1);
    }

    [Fact]
    public async Task Handle_last30_returnsExactly30Buckets()
    {
        // Arrange: two days with data anywhere in the window.
        var store = CreateStore();
        var today = FixedNow.UtcDateTime.Date;
        ArrangeUsages(
            CreateUsage(store, today),
            CreateUsage(store, today.AddDays(-29)));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(30), CancellationToken.None);

        // Assert
        var dto = result.Data!;
        dto.StoreUsagesCountDays.Should().HaveCount(30);
        dto.OwnerNamesPerDay.Should().HaveCount(30);
        dto.StoreUsagesCountDays[0].Should().Be(1);
        dto.StoreUsagesCountDays[29].Should().Be(1);
        dto.StoreUsagesCountDays.Skip(1).Take(28).Should().OnlyContain(c => c == 0);
    }

    [Fact]
    public async Task Handle_usagesPerDay_deduplicatedPerStorePerDay()
    {
        // Arrange: same store twice today (two rows) → counts once per (store, day).
        var store = CreateStore();
        var today = FixedNow.UtcDateTime.Date;
        ArrangeUsages(
            CreateUsage(store, today),
            CreateUsage(store, today));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7), CancellationToken.None);

        // Assert
        var dto = result.Data!;
        dto.StoreUsagesCountDays[6].Should().Be(1, "dedup per (StoreId, Day)");
    }

    // Note: inactive stores are filtered by the repository's SQL (usage.Store.IsActive),
    // covered by the E2E smoke tests against a real database — not re-tested here with a mock.

    [Fact]
    public async Task Handle_nonSuperAdmin_throws400()
    {
        _httpContext.Setup(x => x.IsSuperAdmin).Returns(false);

        var act = () => CreateHandler().Handle(new GetStoreLastUsagesQuery(7), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }
}
