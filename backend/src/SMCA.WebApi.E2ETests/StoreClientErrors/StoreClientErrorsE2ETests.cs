using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreClientErrors;

/// <summary>
/// End-to-end proof of the SuperAdmin read screen of `pos-client-error-logs` (specs S6, S7):
/// the POS publishes errors through the real ingest endpoint — one with a store and one without
/// (S4) — and the SuperAdmin reads them back through the real GET, joined to the owner and store
/// names at read time (S6), ordered by `OccurredAt` descending.
/// </summary>
[Collection("e2e")]
public sealed class StoreClientErrorsE2ETests
{
    private const string IngestRoute = "/api/v1/store-client-errors";
    private const string ReadRoute = "/api/v1/store-client-errors";

    private readonly AppTestFactory _f;

    public StoreClientErrorsE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_as_super_admin_returns_store_and_null_store_rows_ordered_by_occurred_at_desc()
    {
        var storeName = $"SCE-Store-{Guid.NewGuid():N}";
        var store = await StoreSeed.SeedStoreAsync(_f, storeName, approved: true);

        var login = $"sce-sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var client = DbTestHelpers.AuthedClient(_f, admin, login);

        var suffix = Guid.NewGuid().ToString("N");
        var storeMessage = $"POS crash {suffix}";
        var nullStoreMessage = $"POS login crash {suffix}";

        var now = DateTime.UtcNow;
        var storeOccurredAt = now.AddMinutes(-1);
        var nullStoreOccurredAt = now.AddMinutes(-5);

        try
        {
            // Arrange: two real ingests, one with the store and one with no session at all.
            var withStore = await client.PostAsJsonAsync(IngestRoute, new
            {
                storeId = store.StoreId,
                errors = new[]
                {
                    new
                    {
                        occurredAt = storeOccurredAt,
                        message = storeMessage,
                        route = "/sales/new",
                        location = "app/sales/new.tsx:42",
                        count = 3,
                        appVersion = "1.4.2",
                        device = "Android 14 / POS-01",
                    },
                },
            });
            withStore.StatusCode.Should().Be(HttpStatusCode.NoContent);

            var withoutStore = await client.PostAsJsonAsync(IngestRoute, new
            {
                storeId = (Guid?)null,
                errors = new[]
                {
                    new
                    {
                        occurredAt = nullStoreOccurredAt,
                        message = nullStoreMessage,
                        route = "/login",
                    },
                },
            });
            withoutStore.StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Act
            var response = await client.GetAsync(
                $"{ReadRoute}?from={Uri.EscapeDataString(now.AddHours(-1).ToString("o"))}" +
                $"&to={Uri.EscapeDataString(now.AddHours(1).ToString("o"))}");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreClientErrorsPagePayload>>(ApiResponse.Json);

            body.Should().NotBeNull();
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.Page.Should().Be(1);
            body.Data.PageSize.Should().Be(50);
            body.Data.TotalCount.Should().BeGreaterThanOrEqualTo(2);

            var storeRow = body.Data.Items.Should().ContainSingle(i => i.Message == storeMessage).Subject;
            storeRow.StoreId.Should().Be(store.StoreId);
            storeRow.StoreName.Should().Be(storeName);
            storeRow.OwnerName.Should().Be("E2E Owner");
            storeRow.Route.Should().Be("/sales/new");
            storeRow.Count.Should().Be(3);
            storeRow.AppVersion.Should().Be("1.4.2");
            storeRow.Device.Should().Be("Android 14 / POS-01");

            // S4: a row with no store keeps its log entry and renders NO owner and NO store name.
            var nullStoreRow = body.Data.Items.Should().ContainSingle(i => i.Message == nullStoreMessage).Subject;
            nullStoreRow.StoreId.Should().BeNull();
            nullStoreRow.OwnerName.Should().BeNull();
            nullStoreRow.StoreName.Should().BeNull();
            nullStoreRow.Route.Should().Be("/login");

            // S6: OccurredAt descending — the newer row comes first.
            var messages = body.Data.Items.Select(i => i.Message).ToList();
            messages.IndexOf(storeMessage).Should().BeLessThan(messages.IndexOf(nullStoreMessage));
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DeleteNullStoreRowsAsync(nullStoreMessage);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    [Fact]
    public async Task Get_as_non_super_admin_is_rejected()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync(ReadRoute);

            response.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    /// <summary>
    /// A null-store row is outside the Store cascade, so `ResetDataAsync` cannot reach it and it
    /// would leak into the next run. Deleted by its unique message, through EF so the shared
    /// NoTracking context cannot swallow the delete.
    /// </summary>
    private async Task DeleteNullStoreRowsAsync(string message)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Domain.Entities.StoreClientErrors.StoreClientError>()
            .Where(x => x.Message == message)
            .ExecuteDeleteAsync();
    }

    /// <summary>Response payload of the read endpoint, mirroring the Application DTO shape.</summary>
    public sealed class StoreClientErrorsPagePayload
    {
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public List<StoreClientErrorItemPayload> Items { get; set; } = new();
    }

    public sealed class StoreClientErrorItemPayload
    {
        public Guid Id { get; set; }
        public Guid? StoreId { get; set; }
        public string? OwnerName { get; set; }
        public string? StoreName { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? Route { get; set; }
        public string? Location { get; set; }
        public int Count { get; set; }
        public string? Context { get; set; }
        public string? AppVersion { get; set; }
        public string? Device { get; set; }
        public DateTime OccurredAt { get; set; }
        public DateTime ReceivedAt { get; set; }
    }
}
