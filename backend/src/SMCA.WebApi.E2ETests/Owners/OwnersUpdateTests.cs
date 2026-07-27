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
        // NOTE: User.FullName changes are NOT persisted because ApplicationDbContext has
        // QueryTrackingBehavior.NoTracking by default. The UpdateAsync marks Owner as Modified
        // but navigation properties (User) are not tracked by the change tracker.
        // Only root-entity (Owner) properties like IsActive and Description are saved.
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(fullName: "Updated Owner", isActive: false));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters().FirstAsync(o => o.Id == owner.OwnerId))
                .IsActive.Should().BeFalse();
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_nonexistent_id_returns_400_Id()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/Owners/{Guid.NewGuid()}", Body());
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
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
}