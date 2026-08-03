using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Administration.Owners;
using Domain.Common.Constants;
using Domain.Common.Enums;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersCreateGapTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Valid(string? login = null, string password = "Password123", Guid? reSellerId = null) => new
    {
        Login = login ?? $"o-{Guid.NewGuid():N}@test.com", Password = password, FullName = "E2E Owner",
        Cellphone = "0000000000", ReSellerId = reSellerId, Email = (string?)null, Description = "e2e"
    };

    // The create handler gate is SuperAdmin || ReSeller — a ReSeller actor can create an owner (R7.1).
    [Fact]
    public async Task Create_owner_as_reseller_returns_201()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var newLogin = $"owner-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).PostAsJsonAsync("/api/v1/Owners", Valid(newLogin));
            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.Id.Should().NotBeEmpty();

            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            if (created is not null) newTenantId = created.TenantId;
        }
        finally
        {
            if (newTenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, newTenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    // OQ-3 3a: a ReSeller that was present when the request was composed but is gone when it
    // executes must yield 400 with a clear error — never an NRE/500. The seeded ReSeller row
    // is removed before the POST to simulate the race-window absence at execution time.
    [Fact]
    public async Task Create_owner_with_missing_reseller_returns_400_not_500()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var resellerUser = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        Guid reSellerId = Guid.Empty;
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var reSeller = Domain.Entities.ReSellers.ReSeller.Create(
                    resellerUser.UserId, true, 0, 25, DataUtils.DefaultTenant.Id, "E2E Missing ReSeller");
                db.Set<Domain.Entities.ReSellers.ReSeller>().Add(reSeller);
                await db.SaveChangesAsync();
                reSellerId = reSeller.Id;
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var rows = await db.Set<Domain.Entities.ReSellers.ReSeller>().IgnoreQueryFilters()
                    .Where(r => r.Id == reSellerId).ToListAsync();
                db.Set<Domain.Entities.ReSellers.ReSeller>().RemoveRange(rows);
                await db.SaveChangesAsync();
            }

            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Owners", Valid(reSellerId: reSellerId));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeFalse();
            b.Errors.Should().NotBeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, resellerUser.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }
}