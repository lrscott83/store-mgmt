using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreCreateTests
{
    private readonly AppTestFactory _f;
    public StoreCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Approved is ignored on every creation path (2026-09-10); kept in the body for contract compat.
    // store-birth-superior (2026-10-11): no ModuleIds — the birth module set is the Superior
    // plan catalog, derived server-side.
    private static object Body(Guid ownerId, string name) => new
    { OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null, Approved = false };

    [Fact]
    public async Task Create_with_valid_payload_persists_store_and_modules()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        var name = $"Store-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, name));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            created = body.Data!.Id;
            response.Headers.Location.Should().NotBeNull();
            response.Headers.Location!.AbsolutePath.Should().Be($"/api/v1/stores/{created}");
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Id == created)).Should().BeTrue();
            (await db.Set<Domain.Entities.StoreModules.StoreModule>().IgnoreQueryFilters().AnyAsync(m => m.StoreId == created)).Should().BeTrue();
            (await StoreSeed.GetApprovedAsync(_f, created)).Should().BeTrue(); // body Approved=false is ignored: creation forces approved=true (2026-09-10)
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_with_empty_name_returns_400_code_Name()
        => await AssertCreate400(owner => Body(owner.OwnerId, ""), "Name");

    [Fact]
    public async Task Create_with_empty_owner_returns_400_code_OwnerId()
        => await AssertCreate400(_ => Body(Guid.Empty, $"S-{Guid.NewGuid():N}"), "OwnerId", seedOwner: false);

    [Fact]
    public async Task Create_with_unknown_owner_returns_400_code_OwnerId()
        => await AssertCreate400(_ => Body(Guid.NewGuid(), $"S-{Guid.NewGuid():N}"), "OwnerId", seedOwner: false);

    [Fact]
    public async Task Create_with_an_unavailable_module_in_the_body_still_creates()
    {
        // store-birth-superior (2026-10-11): the ModuleIds validator rules are gone, so the
        // old "Module 999999 is not AvailableToStore -> 400 ModuleIds" case cannot exist any more.
        // A legacy field naming a non-catalog module is IGNORED (System.Text.Json drops unknown
        // members) and the store is born on the catalog — the pin is the 201, so a future
        // re-introduction of a ModuleIds rule fails here instead of passing unnoticed.
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", new
                {
                    OwnerId = owner.OwnerId,
                    Name = $"S-{Guid.NewGuid():N}",
                    Address = (string?)null,
                    Description = (string?)null,
                    Approved = true,
                    ModuleIds = new[] { StoreSeed.UnavailableModuleId },
                });
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.StoreModules.StoreModule>().IgnoreQueryFilters()
                .AnyAsync(m => m.StoreId == created && m.ModuleId == StoreSeed.UnavailableModuleId))
                .Should().BeFalse("a module the caller named but the plan does not carry is never granted");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_with_duplicate_name_returns_400()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var o1 = await StoreSeed.SeedOwnerAsync(_f);
        var o2 = await StoreSeed.SeedOwnerAsync(_f);
        var dup = $"Dup-{Guid.NewGuid():N}";
        Guid s1 = Guid.Empty;
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var r1 = await client.PostAsJsonAsync("/api/v1/stores", Body(o1.OwnerId, dup));
            r1.StatusCode.Should().Be(HttpStatusCode.Created);
            var b1 = await r1.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            b1!.Succeeded.Should().BeTrue(); s1 = b1.Data!.Id;

            var r2 = await client.PostAsJsonAsync("/api/v1/stores", Body(o2.OwnerId, dup));
            r2.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            if (s1 != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, s1);
            await StoreSeed.CleanupOwnerAsync(_f, o1.OwnerId, o1.UserId);
            await StoreSeed.CleanupOwnerAsync(_f, o2.OwnerId, o2.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_without_token_returns_401()
    {
        var response = await _f.CreateClient().PostAsJsonAsync("/api/v1/stores", Body(Guid.NewGuid(), "x"));
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertCreate400(Func<StoreSeed.OwnerFixture, object> body, string expectedCode, bool seedOwner = true)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        StoreSeed.OwnerFixture? owner = seedOwner ? await StoreSeed.SeedOwnerAsync(_f) : null;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores", body(owner ?? new StoreSeed.OwnerFixture(Guid.Empty, Guid.Empty)));
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == expectedCode);
        }
        finally
        {
            if (owner is not null) await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}