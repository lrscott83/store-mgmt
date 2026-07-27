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
public sealed class OwnersCreateTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Create_owner_persists_tenant_user_owner_and_role()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var newLogin = $"owner-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/Owners", new
            {
                Login = newLogin, Password = "Password123", FullName = "E2E Owner",
                Cellphone = "0000000000", ReSellerId = (Guid?)null, Email = (string?)null, Description = "e2e"
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            created.Should().NotBeNull();
            newTenantId = created!.TenantId;   // CreateOwnerService creates a NEW tenant

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters()
                .AnyAsync(o => o.UserId == created.Id)).Should().BeTrue();
            (await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters()
                .AnyAsync(x => x.UserId == created.Id && x.RoleId == (int)Domain.Common.Enums.RoleType.OwnerAdmin)).Should().BeTrue();
        }
        finally
        {
            if (newTenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, newTenantId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }
}