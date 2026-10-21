using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// public-catalog-static-pages (T8): the public location block is OPT-IN over the general PUT.
/// These tests pin the HTTP round-trip the catalog panel needs — the controller used to drop
/// UpdateLocation and the six location fields, so the panel's save persisted nothing while the
/// endpoint still answered 200.
/// </summary>
[Collection("e2e")]
public sealed class StoreLocationUpdateTests
{
    private readonly AppTestFactory _f;

    public StoreLocationUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record LocationRow(
        string Name, string? Address, string? PublicPhone, string? AddressCity,
        string? AddressProvince, double? Latitude, double? Longitude, string? OpeningHoursJson);

    private static async Task<LocationRow> ReadLocationAsync(AppTestFactory f, Guid storeId)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var s = await db.Set<Domain.Entities.Stores.Store>()
            .IgnoreQueryFilters()
            .FirstAsync(x => x.Id == storeId);
        return new LocationRow(s.Name, s.Address, s.PublicPhone, s.AddressCity,
            s.AddressProvince, s.Latitude, s.Longitude, s.OpeningHoursJson);
    }

    private static object LocationBody(string name, string address) => new
    {
        Id = Guid.Empty,
        Name = name,
        Address = address,
        Description = (string?)null,
        Approved = false,
        IsActive = true,
        PublicPhone = "+53 5555 1234",
        AddressCity = "La Habana",
        AddressProvince = "Playa",
        Latitude = 23.13,
        Longitude = -82.38,
        OpeningHours = new[] { new { day = "Monday", opens = "09:00", closes = "17:00" } },
        UpdateLocation = true
    };

    [Fact]
    public async Task Update_with_updateLocation_persists_the_whole_public_location_block()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var newName = $"Located-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PutAsJsonAsync($"/api/v1/stores/{sa.StoreId}", LocationBody(newName, "Calle 1 #234"));

            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();

            var row = await ReadLocationAsync(_f, sa.StoreId);
            row.Name.Should().Be(newName);
            row.Address.Should().Be("Calle 1 #234");
            row.PublicPhone.Should().Be("+53 5555 1234");
            row.AddressCity.Should().Be("La Habana");
            row.AddressProvince.Should().Be("Playa");
            row.Latitude.Should().Be(23.13);
            row.Longitude.Should().Be(-82.38);
            row.OpeningHoursJson.Should().NotBeNullOrWhiteSpace().And.Contain("Monday");
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task Update_without_updateLocation_leaves_the_stored_location_untouched()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login);
            var seeded = await client.PutAsJsonAsync(
                $"/api/v1/stores/{sa.StoreId}", LocationBody($"Located-{Guid.NewGuid():N}", "Calle 1 #234"));
            seeded.StatusCode.Should().Be(HttpStatusCode.OK);

            // A rename-only caller sends no location fields and no flag: the stored block survives.
            var renamed = $"Renamed-{Guid.NewGuid():N}";
            var r = await client.PutAsJsonAsync($"/api/v1/stores/{sa.StoreId}", new
            {
                Id = Guid.Empty,
                Name = renamed,
                Address = "ignored-addr",
                Description = (string?)null,
                Approved = false,
                IsActive = true
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var row = await ReadLocationAsync(_f, sa.StoreId);
            row.Name.Should().Be(renamed);
            row.Address.Should().Be("Calle 1 #234");
            row.PublicPhone.Should().Be("+53 5555 1234");
            row.AddressCity.Should().Be("La Habana");
            row.AddressProvince.Should().Be("Playa");
            row.Latitude.Should().Be(23.13);
            row.Longitude.Should().Be(-82.38);
            row.OpeningHoursJson.Should().NotBeNullOrWhiteSpace().And.Contain("Monday");
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task Update_with_updateLocation_and_an_omitted_field_clears_the_stored_value()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login);
            var seeded = await client.PutAsJsonAsync(
                $"/api/v1/stores/{sa.StoreId}", LocationBody($"Located-{Guid.NewGuid():N}", "Calle 1 #234"));
            seeded.StatusCode.Should().Be(HttpStatusCode.OK);

            // The panel clears a field by omitting it while the flag is on: the wire drops
            // `undefined` keys, so the backend must overwrite the stored value with null
            // instead of keeping the old one — that is the empty-field behavior the UI promises.
            var cleared = await client.PutAsJsonAsync($"/api/v1/stores/{sa.StoreId}", new
            {
                Id = Guid.Empty,
                Name = $"Located-{Guid.NewGuid():N}",
                Address = "Calle 1 #234",
                Description = (string?)null,
                Approved = false,
                IsActive = true,
                AddressProvince = "Playa",
                Latitude = 23.13,
                Longitude = -82.38,
                OpeningHours = new[] { new { day = "Monday", opens = "09:00", closes = "17:00" } },
                UpdateLocation = true
            });
            cleared.StatusCode.Should().Be(HttpStatusCode.OK);

            var row = await ReadLocationAsync(_f, sa.StoreId);
            row.PublicPhone.Should().BeNull();
            row.AddressCity.Should().BeNull();
            row.AddressProvince.Should().Be("Playa");
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }
}
