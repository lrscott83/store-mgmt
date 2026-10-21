using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Application.Dtos.SalesManagers;
using Domain.Common.Enums;
using Domain.Entities.SalesManagers;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.E2ETests.Orders;
using Xunit;

namespace SMCA.WebApi.E2ETests.SalesManagers;

/// <summary>
/// T4: el Owner crea un gestor de ventas (rol 5 + perfil Owner-level), el gestor entra sin
/// tienda, /me lo marca como gestor, y al desactivarlo el login se rechaza.
/// </summary>
[Collection("e2e")]
public sealed class SalesManagerManagementE2ETests
{
    private const string GestorPassword = "Password123";
    private readonly AppTestFactory _f;

    public SalesManagerManagementE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task EnableGestoresModuleAsync(PublicOrderingSeed.OrderingFixture fixture)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreModule>().Add(StoreModule.Create(
            fixture.StoreId,
            (int)ModuleType.GestoresVentas,
            price: 10,
            modulePriceIncluded: false,
            modulePrice: 20,
            moduleDiscountPrice: 0,
            modulePercentDiscountPrice: 50,
            tenantId: fixture.TenantId));
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
            fixture.StoreId,
            (int)RoleType.OwnerAdmin,
            (int)FeatureType.GestoresVentas,
            fixture.TenantId));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Owner_creates_a_gestor_who_can_log_in_and_is_rejected_after_deactivation()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid gestorUserId = Guid.Empty;
        Guid managerId = Guid.Empty;

        try
        {
            await EnableGestoresModuleAsync(fixture);

            var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            string login = $"gestor-{Guid.NewGuid():N}@test.com";
            var create = await ownerClient.PostAsJsonAsync("/api/v1/SalesManagers", new
            {
                Login = login,
                Password = GestorPassword,
                FullName = "E2E Gestor de Ventas",
                CellPhone = "0000000000",
                Email = login,
            });
            create.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await create.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                User user = await db.Set<User>().IgnoreQueryFilters()
                    .SingleAsync(u => u.Login == login);
                gestorUserId = user.Id;

                UserRole role = await db.Set<UserRole>().IgnoreQueryFilters()
                    .SingleAsync(ur => ur.UserId == user.Id);
                role.RoleId.Should().Be((int)RoleType.GestorVentas);

                SalesManager manager = await db.Set<SalesManager>().IgnoreQueryFilters()
                    .SingleAsync(m => m.UserId == user.Id);
                manager.OwnerId.Should().Be(fixture.OwnerId);
                manager.TenantId.Should().Be(fixture.TenantId);
                managerId = manager.Id;
            }

            var loginResponse = await _f.CreateClient().PostAsJsonAsync(
                "/api/v1/auth/login",
                new { Login = login, Password = GestorPassword });
            loginResponse.StatusCode.Should().Be(HttpStatusCode.OK,
                "un gestor activo entra sin tienda");

            var gestorClient = DbTestHelpers.AuthedClient(_f, gestorUserId, login);
            var meResponse = await gestorClient.GetAsync("/api/v1/auth/me");
            meResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var me = await meResponse.Content
                .ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            me!.Data!.IsGestorVentas.Should().BeTrue();
            me.Data.IsOwnerAdmin.Should().BeFalse();
            me.Data.IsReSeller.Should().BeFalse();

            var list = await ownerClient.GetAsync("/api/v1/SalesManagers/all/true");
            list.StatusCode.Should().Be(HttpStatusCode.OK);
            var listed = await list.Content
                .ReadFromJsonAsync<ApiResponse<List<SalesManagerDto>>>(ApiResponse.Json);
            listed!.Data.Should().ContainSingle(m => m.Id == managerId && m.IsActive);

            var deactivate = await ownerClient.PutAsJsonAsync(
                $"/api/v1/SalesManagers/{managerId}/active",
                new { IsActive = false });
            deactivate.StatusCode.Should().Be(HttpStatusCode.OK);
            var deactivated = await deactivate.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            deactivated!.Succeeded.Should().BeTrue();

            var rejected = await _f.CreateClient().PostAsJsonAsync(
                "/api/v1/auth/login",
                new { Login = login, Password = GestorPassword });
            rejected.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var rejectedBody = await rejected.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            rejectedBody!.Errors.Should().ContainSingle(e => e.Code == "Auth.AccountInactive");
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                if (managerId != Guid.Empty)
                {
                    await db.Set<SalesManager>().IgnoreQueryFilters()
                        .Where(m => m.Id == managerId).ExecuteDeleteAsync();
                }
                if (gestorUserId != Guid.Empty)
                {
                    await db.Set<UserRole>().IgnoreQueryFilters()
                        .Where(ur => ur.UserId == gestorUserId).ExecuteDeleteAsync();
                    await db.Set<User>().IgnoreQueryFilters()
                        .Where(u => u.Id == gestorUserId).ExecuteDeleteAsync();
                }
            }

            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
