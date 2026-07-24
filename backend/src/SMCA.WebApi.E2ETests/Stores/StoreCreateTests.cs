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

    private static object Body(Guid ownerId, string name, IEnumerable<int> moduleIds) => new
    { OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null, Approved = false, ModuleIds = moduleIds };

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
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            created = body.Data!.Id;
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Id == created)).Should().BeTrue();
            (await db.Set<Domain.Entities.StoreModules.StoreModule>().IgnoreQueryFilters().AnyAsync(m => m.StoreId == created)).Should().BeTrue();
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
        => await AssertCreate400(owner => Body(owner.OwnerId, "", new[] { StoreSeed.ManagementModuleId }), "Name");

    [Fact]
    public async Task Create_with_empty_owner_returns_400_code_OwnerId()
        => await AssertCreate400(_ => Body(Guid.Empty, $"S-{Guid.NewGuid():N}", new[] { StoreSeed.ManagementModuleId }), "OwnerId", seedOwner: false);

    [Fact]
    public async Task Create_with_unknown_owner_returns_400_code_OwnerId()
        => await AssertCreate400(_ => Body(Guid.NewGuid(), $"S-{Guid.NewGuid():N}", new[] { StoreSeed.ManagementModuleId }), "OwnerId", seedOwner: false);

    [Fact]
    public async Task Create_with_empty_modules_returns_400_code_ModuleIds()
        => await AssertCreate400(owner => Body(owner.OwnerId, $"S-{Guid.NewGuid():N}", Array.Empty<int>()), "ModuleIds");

    [Fact]
    public async Task Create_with_unavailable_module_returns_400_code_ModuleIds()
        => await AssertCreate400(owner => Body(owner.OwnerId, $"S-{Guid.NewGuid():N}", new[] { StoreSeed.UnavailableModuleId }), "ModuleIds");

    // KNOWN BUG: IsUniqueName checks User.Login, not Store.Name -> duplicate store names are allowed.
    [Fact]
    public async Task Create_with_duplicate_name_currently_succeeds_KNOWN_BUG()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var o1 = await StoreSeed.SeedOwnerAsync(_f);
        var o2 = await StoreSeed.SeedOwnerAsync(_f);
        var dup = $"Dup-{Guid.NewGuid():N}";
        Guid s1 = Guid.Empty, s2 = Guid.Empty;
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var b1 = await (await client.PostAsJsonAsync("/api/v1/stores", Body(o1.OwnerId, dup, new[] { StoreSeed.ManagementModuleId })))
                .Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            b1!.Succeeded.Should().BeTrue(); s1 = b1.Data!.Id;
            var b2 = await (await client.PostAsJsonAsync("/api/v1/stores", Body(o2.OwnerId, dup, new[] { StoreSeed.ManagementModuleId })))
                .Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            b2!.Succeeded.Should().BeTrue("duplicate store names are NOT enforced (known bug)"); s2 = b2.Data!.Id;
        }
        finally
        {
            if (s1 != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, s1);
            if (s2 != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, s2);
            await StoreSeed.CleanupOwnerAsync(_f, o1.OwnerId, o1.UserId);
            await StoreSeed.CleanupOwnerAsync(_f, o2.OwnerId, o2.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_without_token_returns_401()
    {
        var response = await _f.CreateClient().PostAsJsonAsync("/api/v1/stores", Body(Guid.NewGuid(), "x", new[] { StoreSeed.ManagementModuleId }));
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