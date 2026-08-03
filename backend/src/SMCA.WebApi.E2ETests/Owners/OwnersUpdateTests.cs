using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Administration.Owners;
using Domain.Common.Enums;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersUpdateTests
{
    private readonly AppTestFactory _f;
    public OwnersUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(string fullName = "Updated Owner", string cellPhone = "1112223333",
        string? email = null, bool isActive = true) => new
    {
        ReSellerId = (Guid?)null, FullName = fullName, CellPhone = cellPhone,
        Email = email, Description = "upd", Guest = false, IsActive = isActive
    };

    [Fact]
    public async Task Update_owner_persists_isactive_and_description()
    {
        // User nav properties (FullName) persist because the update path now loads the Owner
        // with AsTracking() (GetOwnerWithUserTrackedAsync) — no more silent NoTracking drops.
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(fullName: "Updated Owner", isActive: false));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.FullName.Should().Be("Updated Owner");

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var row = await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters()
                .Include(o => o.User).FirstAsync(o => o.Id == owner.OwnerId);
            row.IsActive.Should().BeFalse();
            row.User.FullName.Should().Be("Updated Owner");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_nonexistent_id_returns_404()
    {
        // Was 400 Code == "Id" via the validator's MustAsync(OwnerExists); now the handler's
        // null guard throws ApiException(OwnerNotFound, 404) → middleware → real HTTP 404.
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/Owners/{Guid.NewGuid()}", Body());
            r.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeFalse();
            b.ActionCode.Should().Be(404);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // DEV-APPLY NOTE (spec R5 S5 / task 5.3): the delta spec asserted "OwnerAdmin accepted → 200".
    // The class-level [HasPermission(StoreRoleFeatures.OwnersAdmin)] filter grants the Owners
    // feature to SuperAdmin + ReSeller roles only (see StoreRoleFeatures.OwnersAdmin attributes),
    // so an OwnerAdmin actor is denied with 403 BEFORE the handler runs — design decision A made
    // the filter the sole gate, and its rationale itself states the filter "returns 403 via
    // ForbidResult". The real E2E contract is 403 (no write), which this test pins.
    [Fact]
    public async Task Update_owner_owneradmin_rejected_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(fullName: "Should Not Persist"));
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var row = await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters()
                .Include(o => o.User).FirstAsync(o => o.Id == owner.OwnerId);
            row.User.FullName.Should().Be("E2E Owner");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task Update_owner_cross_tenant_reseller_returns_404_no_write()
    {
        // AUTH-OU1 2a: a non-SuperAdmin actor whose TenantId differs from the target owner's
        // tenant must get a 404 envelope and the write must NOT happen.
        var owner = await StoreSeed.SeedOwnerAsync(_f); // tenant A (DefaultTenant)
        var (tenantB, actorId, actorLogin) = await SeedReSellerInNewTenantAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actorId, actorLogin)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(fullName: "IDOR Write"));
            r.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeFalse();
            b.ActionCode.Should().Be(404);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var row = await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters()
                .Include(o => o.User).FirstAsync(o => o.Id == owner.OwnerId);
            row.User.FullName.Should().Be("E2E Owner");
        }
        finally
        {
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantB);
        }
    }

    [Fact]
    public async Task Update_owner_empty_fullname_returns_400_FullName()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(fullName: ""));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "FullName");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_invalid_email_returns_400_Email()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(email: "not-an-email"));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Email");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    private async Task<(Guid TenantId, Guid UserId, string Login)> SeedReSellerInNewTenantAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Guid.NewGuid();
        db.Set<Tenant>().Add(Tenant.Create(tenantId, $"XT-{Guid.NewGuid():N}", "e2e", DateTimeOffset.UtcNow));
        var login = $"xtres-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E XTenant ReSeller", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        await db.SaveChangesAsync();
        return (tenantId, user.Id, login);
    }
}
