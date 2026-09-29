using Application.Abstractions.HttpContext;
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
using System.Globalization;
using System.Net;

namespace Application.Tests.Features.Management.Usages.Queries.GetStoreLastUsages;

/// <summary>
/// Unit tests for GetStoreLastWeekUsagesQueryHandler (dashboard del superadmin).
/// Contract: the response has EXACTLY LastDays buckets — one per calendar day from
/// (query.Today - (LastDays-1)) to query.Today inclusive — with an explicit 0 (and an
/// empty owners list) for any day without usage rows. No left-padding shift, so
/// the frontend maps buckets 1:1 onto day labels.
/// <para>
/// The window is anchored on the <see cref="DateOnly"/> the CLIENT sent
/// (<c>GetStoreLastUsagesQuery.Today</c>), never on the server clock: the dashboard
/// labels are built from the browser's local calendar day, so a user in UTC-5 after
/// 19:00 local would otherwise see tomorrow's (empty) bucket labelled as today.
/// </para>
/// </summary>
public class GetStoreLastUsagesQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContext = new();
    private readonly Mock<IStoreUsageRepository> _usageRepo = new();
    private readonly Mock<IStoreRepository> _storeRepo = new();
    private readonly Mock<IMapper> _mapper = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    /// <summary>The "today" the dashboard client reports — a pure calendar day, no time.</summary>
    private static readonly DateOnly Today = new(2026, 9, 14);

    private static readonly DateTime TodayUtc = Today.ToDateTime(TimeOnly.MinValue);

    /// <summary>Wire shape of a client day: the validator only accepts this ISO form.</summary>
    private static string Iso(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public GetStoreLastUsagesQueryHandlerTests()
    {
        _httpContext.Setup(x => x.IsSuperAdmin).Returns(true);
        _localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "UserNotFound"));
    }

    private GetStoreLastWeekUsagesQueryHandler CreateHandler()
        => new(
            _httpContext.Object,
            _usageRepo.Object,
            _mapper.Object,
            _localizer.Object,
            _storeRepo.Object);

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
        ArrangeUsages(CreateUsage(store, TodayUtc));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7, Iso(Today)), CancellationToken.None);

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
        ArrangeUsages(CreateUsage(store, TodayUtc.AddDays(-1)));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7, Iso(Today)), CancellationToken.None);

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
        var inWindow = CreateUsage(store, TodayUtc.AddDays(-6));
        var outOfWindow = CreateUsage(store, TodayUtc.AddDays(-7));

        DateTime capturedCutoff = default;
        _usageRepo
            .Setup(x => x.GetStoresUsagesAfterDateWithOwnerAsync(It.IsAny<DateTime>()))
            .Callback<DateTime>(d => capturedCutoff = d)
            .ReturnsAsync(new[] { inWindow, outOfWindow });

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7, Iso(Today)), CancellationToken.None);

        // Assert: the repository must be asked for exactly today-(7-1) = today-6.
        capturedCutoff.Should().Be(TodayUtc.AddDays(-6));

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
        ArrangeUsages(
            CreateUsage(store, TodayUtc),
            CreateUsage(store, TodayUtc.AddDays(-29)));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(30, Iso(Today)), CancellationToken.None);

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
        ArrangeUsages(
            CreateUsage(store, TodayUtc),
            CreateUsage(store, TodayUtc));

        // Act
        var result = await CreateHandler().Handle(new GetStoreLastUsagesQuery(7, Iso(Today)), CancellationToken.None);

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

        var act = () => CreateHandler().Handle(new GetStoreLastUsagesQuery(7, Iso(Today)), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    // ── Contract: the window follows the CLIENT's calendar day ───────────

    /// <summary>
    /// Regression guard for the reported bug: the dashboard showed the wrong day for
    /// users behind UTC. The window used to be anchored on <c>UtcNow</c>, so from
    /// 19:00 local (UTC-5) onward the server's newest bucket was a day that had not
    /// happened yet for that user, while the labels stayed local — the whole chart
    /// slid one day.
    /// <para>
    /// The handler no longer takes an <c>IDateTimeProvider</c>, so "the server clock"
    /// can only re-enter through a new dependency. What this test pins is the
    /// observable half: a <c>Today</c> deliberately far from the machine's real date
    /// MUST move the window. If anything ever re-derives the anchor from the clock,
    /// the seeded row stops landing in the last bucket and this fails.
    /// </para>
    /// </summary>
    [Fact]
    public async Task Handle_windowAnchorsOnThePassedToday_notOnTheServerClock()
    {
        // Arrange: a client-day deliberately unrelated to the machine's real date.
        var clientToday = new DateOnly(2026, 6, 1);
        var clientTodayUtc = clientToday.ToDateTime(TimeOnly.MinValue);
        clientToday.Should().NotBe(DateOnly.FromDateTime(DateTime.UtcNow),
            "the fixture date must stay far from the server clock or the test cannot discriminate");

        var store = CreateStore();
        ArrangeUsages(CreateUsage(store, clientTodayUtc));

        DateTime capturedCutoff = default;
        _usageRepo
            .Setup(x => x.GetStoresUsagesAfterDateWithOwnerAsync(It.IsAny<DateTime>()))
            .Callback<DateTime>(d => capturedCutoff = d)
            .ReturnsAsync(new[] { CreateUsage(store, clientTodayUtc) });

        // Act
        var result = await CreateHandler()
            .Handle(new GetStoreLastUsagesQuery(7, Iso(clientToday)), CancellationToken.None);

        // Assert: window = [clientToday-6 .. clientToday], the usage in the LAST bucket.
        capturedCutoff.Should().Be(clientTodayUtc.AddDays(-6));
        var dto = result.Data!;
        dto.StoreUsagesCountDays.Should().HaveCount(7);
        dto.StoreUsagesCountDays[6].Should().Be(1,
            "usage recorded on the client's own today must be the newest bucket");
        dto.StoreUsagesCountDays.Take(6).Should().OnlyContain(c => c == 0);
        dto.OwnerNamesPerDay[6].Should().ContainSingle().Which.Should().Be("Owner User");
    }

    /// <summary>
    /// The same anchor drives the 30-day window — a day near the client and a day near
    /// the server clock land in different buckets when they differ.
    /// </summary>
    [Fact]
    public async Task Handle_last30_windowAnchorsOnThePassedToday_notOnTheServerClock()
    {
        var clientToday = new DateOnly(2026, 6, 1);
        var clientTodayUtc = clientToday.ToDateTime(TimeOnly.MinValue);

        var store = CreateStore();
        ArrangeUsages(CreateUsage(store, clientTodayUtc));

        var result = await CreateHandler()
            .Handle(new GetStoreLastUsagesQuery(30, Iso(clientToday)), CancellationToken.None);

        var dto = result.Data!;
        dto.StoreUsagesCountDays.Should().HaveCount(30);
        dto.StoreUsagesCountDays[29].Should().Be(1);
        dto.StoreUsagesCountDays.Take(29).Should().OnlyContain(c => c == 0);
    }
}
