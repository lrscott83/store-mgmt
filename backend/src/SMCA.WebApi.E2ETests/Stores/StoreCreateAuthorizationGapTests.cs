using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

// Pins CURRENT defective behavior (H-10): POST /v1/stores carries no action-level
// [HasPermission], so the class-level [HasPermission(SuperAdmin, StoresAdmin)] gate is
// the only authorization. An OwnerAdmin holding the Stores feature (73) passes that gate
// and the handler deliberately admits OwnerAdmins (CreateStoreCommand.cs:50-61) — 201 +
// persistence + SelectedStoreId re-point. A StoreUser granted feature 73 also passes the
// gate but is rejected by the handler with 400, not 403 (CreateStoreCommand.cs:50-51).
// Spec R2.10 / R2.11. Coupling: when H-10 is fixed, these tests MUST be updated in the
// same change.
[Collection("e2e")]
public sealed class StoreCreateAuthorizationGapTests
{
    private readonly AppTestFactory _f;
    public StoreCreateAuthorizationGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid ownerId, string name, IEnumerable<int> moduleIds) => new
    { OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null, Approved = false, ModuleIds = moduleIds };

    [Fact]
    public async Task OwnerAdmin_with_stores_feature_can_create_store_directly_and_repoints_selected_store_id()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var name = $"S-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PostAsJsonAsync("/api/v1/stores", Body(sa.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
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
            var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters().FirstAsync(u => u.Id == sa.UserId);
            user.SelectedStoreId.Should().Be(created);
            user.SelectedStoreId.Should().NotBe(sa.StoreId);
        }
        finally
        {
            // The new store shares the fixture's owner — delete the new store's graph first
            // (StoreRoleFeature/StoreModule/Store), then the fixture graph (D-4).
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }

    [Fact]
    public async Task Store_user_with_stores_feature_gets_400_not_403()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", Body(f.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeFalse();
            b.Errors.Should().NotBeEmpty();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }
}
