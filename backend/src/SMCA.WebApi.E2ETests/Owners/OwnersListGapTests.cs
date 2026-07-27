using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersListGapTests
{
    private readonly AppTestFactory _f;
    public OwnersListGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class OwnerRow { public Guid Id { get; set; } public bool IsActive { get; set; } }

    private async Task DeactivateOwnerAsync(Guid ownerId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var o = await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters().AsTracking().FirstAsync(x => x.Id == ownerId);
        o.IsActive = false;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task List_owners_includeInactive_true_includes_inactive_owner()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        await DeactivateOwnerAsync(owner.OwnerId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Owners/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<OwnerRow>>>(ApiResponse.Json);
            b!.Data!.Should().Contain(o => o.Id == owner.OwnerId && !o.IsActive);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_owners_includeInactive_false_excludes_inactive_owner()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        await DeactivateOwnerAsync(owner.OwnerId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Owners/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<OwnerRow>>>(ApiResponse.Json);
            b!.Data!.Should().NotContain(o => o.Id == owner.OwnerId);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}