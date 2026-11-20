using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreClientErrors;

/// <summary>
/// End-to-end proof of the READ contract of `pos-client-error-logs` (specs S6 and S7) that the
/// original two cases left implicit: the owner/store filters narrow real PostgreSQL rows over
/// HTTP, both date bounds are INCLUSIVE, `TotalCount` is the count of the whole filter and not of
/// the page, and an authenticated non-SuperAdmin is rejected with exactly 403.
///
/// Rows are published through the real ingest endpoint by each store's OWN OwnerAdmin, because the
/// ingest endpoint verifies that the caller may touch the `storeId` it claims (U1); a SuperAdmin
/// token carries no selected store, so it cannot attribute rows to a store.
/// </summary>
[Collection("e2e")]
public sealed class StoreClientErrorsReadQueryE2ETests
{
    private const string IngestRoute = "/api/v1/store-client-errors";
    private const string ReadRoute = "/api/v1/store-client-errors";

    private readonly AppTestFactory _f;

    public StoreClientErrorsReadQueryE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_narrows_by_owner_id_and_store_id_over_real_postgresql()
    {
        // Arrange: two owners with one store each, so owner and store filters are distinguishable.
        var first = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var second = await StoreSeed.SeedStoresAdminUserAsync(_f);

        var adminLogin = $"sce-filter-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var adminClient = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);

        var suffix = Guid.NewGuid().ToString("N");
        var firstMessage = $"first owner crash {suffix}";
        var secondMessage = $"second owner crash {suffix}";
        var occurredAt = TruncateToSecond(DateTime.UtcNow.AddMinutes(-2));

        try
        {
            // Each OWNER publishes to its own store: the ingest verifies the attribution.
            await IngestAsync(DbTestHelpers.AuthedClient(_f, first.UserId, first.Login),
                first.StoreId, occurredAt, firstMessage);
            await IngestAsync(DbTestHelpers.AuthedClient(_f, second.UserId, second.Login),
                second.StoreId, occurredAt, secondMessage);

            var range = Range(occurredAt.AddMinutes(-1), occurredAt.AddMinutes(1));

            // Act: unfiltered control, then each filter on its own.
            var all = await ReadAsync(adminClient, range);
            var byOwner = await ReadAsync(adminClient, $"{range}&ownerId={first.OwnerId}");
            var byStore = await ReadAsync(adminClient, $"{range}&storeId={second.StoreId}");

            // Assert
            all.Items.Should().Contain(i => i.Message == firstMessage)
                .And.Contain(i => i.Message == secondMessage);

            byOwner.Items.Should().ContainSingle(i => i.Message == firstMessage);
            byOwner.Items.Should().NotContain(i => i.Message == secondMessage);
            byOwner.Items.Should().OnlyContain(i => i.StoreId == first.StoreId);

            byStore.Items.Should().ContainSingle(i => i.Message == secondMessage);
            byStore.Items.Should().NotContain(i => i.Message == firstMessage);
            byStore.Items.Should().OnlyContain(i => i.StoreId == second.StoreId);
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, first);
            await StoreSeed.CleanupStoresAdminAsync(_f, second);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Get_includes_the_rows_sitting_exactly_on_the_from_and_to_bounds()
    {
        // Arrange
        var store = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var adminLogin = $"sce-bounds-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var adminClient = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);
        var ownerClient = DbTestHelpers.AuthedClient(_f, store.UserId, store.Login);

        var suffix = Guid.NewGuid().ToString("N");
        var onFromMessage = $"on from bound {suffix}";
        var onToMessage = $"on to bound {suffix}";
        var outsideMessage = $"past to bound {suffix}";

        var from = TruncateToSecond(DateTime.UtcNow.AddMinutes(-30));
        var to = from.AddMinutes(10);

        try
        {
            await IngestAsync(ownerClient, store.StoreId, from, onFromMessage);
            await IngestAsync(ownerClient, store.StoreId, to, onToMessage);
            await IngestAsync(ownerClient, store.StoreId, to.AddSeconds(1), outsideMessage);

            // Act
            var page = await ReadAsync(adminClient,
                $"{Range(from, to)}&ownerId={store.OwnerId}&pageSize=200");

            // Assert: both extremes are INCLUSIVE and the row one second past `to` is excluded.
            page.TotalCount.Should().Be(2);
            page.Items.Should().ContainSingle(i => i.Message == onFromMessage);
            page.Items.Should().ContainSingle(i => i.Message == onToMessage);
            page.Items.Should().NotContain(i => i.Message == outsideMessage);
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Get_reports_the_total_count_of_the_filter_not_the_page_size()
    {
        // Arrange: three matches, a page of two.
        var store = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var adminLogin = $"sce-count-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var adminClient = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);
        var ownerClient = DbTestHelpers.AuthedClient(_f, store.UserId, store.Login);

        var suffix = Guid.NewGuid().ToString("N");
        var from = TruncateToSecond(DateTime.UtcNow.AddMinutes(-40));
        var to = from.AddMinutes(10);

        try
        {
            for (int i = 0; i < 3; i++)
                await IngestAsync(ownerClient, store.StoreId, from.AddMinutes(i), $"page row {i} {suffix}");

            var range = $"{Range(from, to)}&ownerId={store.OwnerId}&pageSize=2";

            // Act
            var firstPage = await ReadAsync(adminClient, range);
            var secondPage = await ReadAsync(adminClient, $"{range}&page=2");

            // Assert: the count is the whole filter (3), never the page size (2).
            firstPage.TotalCount.Should().Be(3);
            firstPage.PageSize.Should().Be(2);
            firstPage.Page.Should().Be(1);
            firstPage.Items.Should().HaveCount(2);

            secondPage.TotalCount.Should().Be(3);
            secondPage.Page.Should().Be(2);
            secondPage.Items.Should().ContainSingle();
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Get_as_an_authenticated_store_user_returns_exactly_403()
    {
        // Arrange — a valid, authenticated session that is simply not SuperAdmin.
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);

        try
        {
            // Act
            var response = await DbTestHelpers
                .AuthedClient(_f, actor.UserId, actor.Login)
                .GetAsync(ReadRoute);

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    /// <summary>A whole-second instant: PostgreSQL keeps microseconds, JSON keeps ticks.</summary>
    private static DateTime TruncateToSecond(DateTime value) =>
        new(value.Ticks - value.Ticks % TimeSpan.TicksPerSecond, DateTimeKind.Utc);

    private static string Range(DateTime from, DateTime to) =>
        $"from={Uri.EscapeDataString(from.ToString("o"))}" +
        $"&to={Uri.EscapeDataString(to.ToString("o"))}";

    /// <summary>Publishes one error through the real endpoint and checks the accepted status.</summary>
    private static async Task IngestAsync(HttpClient client, Guid storeId, DateTime occurredAt,
        string message)
    {
        var response = await client.PostAsJsonAsync(IngestRoute, new
        {
            storeId,
            errors = new[]
            {
                new { occurredAt, message, route = "/sales/new" },
            },
        });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    private static async Task<StoreClientErrorsE2ETests.StoreClientErrorsPagePayload> ReadAsync(
        HttpClient client, string query)
    {
        var response = await client.GetAsync($"{ReadRoute}?{query}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content
            .ReadFromJsonAsync<ApiResponse<StoreClientErrorsE2ETests.StoreClientErrorsPagePayload>>(
                ApiResponse.Json);

        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();
        return body.Data!;
    }
}
