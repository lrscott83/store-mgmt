using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

// Asserts corrected behavior (H-10): POST /v1/stores is SuperAdmin-only. The action-level
// [HasPermission(SuperAdmin)] gate (StoresController.cs) yields a real HTTP 403 (ForbidResult,
// empty body) before the handler runs — spec R2.10 / R2.11. An OwnerAdmin holding the Stores
// feature (73) is rejected with 403 and no Store/StoreModule row is persisted and no
// SelectedStoreId re-point happens; a StoreUser granted feature 73 gets 403, not 400.
// The handler guard is defense in depth (IsSuperAdmin, 403) for direct MediatR callers (R2.14).
// R2.12 (SuperAdmin 201 + persistence) is covered by StoreCreateTests.
// Coupling: these tests pin the corrected rule and MUST stay in sync with the action gate.
[Collection("e2e")]
public sealed class StoreCreateAuthorizationGapTests
{
    private readonly AppTestFactory _f;
    public StoreCreateAuthorizationGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid ownerId, string name, IEnumerable<int> moduleIds) => new
    { OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null, Approved = false, ModuleIds = moduleIds };

    [Fact]
    public async Task OwnerAdmin_with_stores_feature_gets_403_and_no_side_effects()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PostAsJsonAsync("/api/v1/stores", Body(sa.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
            (await db.Set<Domain.Entities.StoreModules.StoreModule>().IgnoreQueryFilters()
                .AnyAsync(m => db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().Any(s => s.Id == m.StoreId && s.Name == name))).Should().BeFalse();
            var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters().FirstAsync(u => u.Id == sa.UserId);
            user.SelectedStoreId.Should().Be(sa.StoreId);
        }
        finally
        {
            // Nothing was persisted — only the seeded fixture graph needs cleanup.
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }

    [Fact]
    public async Task Store_user_with_stores_feature_gets_403_not_400()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", Body(f.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

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
