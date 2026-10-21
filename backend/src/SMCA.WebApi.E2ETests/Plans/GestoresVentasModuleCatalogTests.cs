using Domain.Common.Enums;
using Domain.Common.Utils;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
using Domain.Entities.Roles;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.E2ETests.Orders;
using Xunit;

namespace SMCA.WebApi.E2ETests.Plans;

/// <summary>
/// S1/S2 del feature Gestores de ventas: el catálogo del módulo 21, su feature 125, el rol 5 y
/// la asignación a Superior/VIP. Contra PostgreSQL real, porque la migración es data-only y el
/// único test que prueba que las filas existen es este.
///
/// El "no se asigna a ninguna tienda por defecto" se afirma sobre una tienda CONCRETA creada por
/// el test (R3-SHARED-DB-ZERO-ASSERT): un conteo global contra la base compartida sería
/// dependiente del orden de la suite. La ausencia de backfill en el momento de la migración la
/// prueban las queries de verificación del script 38.
/// </summary>
[Collection("e2e")]
public sealed class GestoresVentasModuleCatalogTests
{
    private readonly AppTestFactory _f;

    public GestoresVentasModuleCatalogTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Module_feature_role_and_plan_assignment_exist_without_store_backfill()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            Module module = await db.Set<Module>()
                .SingleAsync(m => m.Id == (int)ModuleType.GestoresVentas);
            module.Name.Should().Be("Gestores de ventas");
            module.Price.Should().Be(20f);
            module.PercentDiscountPrice.Should().Be(50f);
            module.DiscountPrice.Should().Be(0f);
            module.PriceIncluded.Should().BeFalse();
            module.AvailableToStore.Should().BeTrue();
            module.IsActive.Should().BeTrue();
            CurrentPriceServiceUtils.GetCurrentPrice(
                module.Price, module.PercentDiscountPrice, module.DiscountPrice)
                .Should().Be(10f, "20 con 50% de descuento deja 10");

            Feature feature = await db.Set<Feature>()
                .SingleAsync(f => f.Id == (int)FeatureType.GestoresVentas);
            feature.Name.Should().Be("Gestores de ventas");
            feature.ModuleId.Should().Be((int)ModuleType.GestoresVentas);
            feature.AvailableToStore.Should().BeTrue();
            feature.IsActive.Should().BeTrue();

            Role role = await db.Set<Role>().SingleAsync(r => r.Id == (int)RoleType.GestorVentas);
            role.Name.Should().Be("Gestor de ventas");
            role.IsActive.Should().BeTrue();

            int[] planIds = await db.Set<StorePlanModule>()
                .Where(spm => spm.ModuleId == (int)ModuleType.GestoresVentas)
                .Select(spm => spm.PlanId)
                .OrderBy(id => id)
                .ToArrayAsync();
            planIds.Should().Equal(
                new[] { (int)StorePlanType.Superior, (int)StorePlanType.VIP },
                "el módulo solo pertenece a Superior (3) y VIP (4)");

            (await db.Set<StoreModule>().IgnoreQueryFilters()
                .CountAsync(sm => sm.StoreId == fixture.StoreId
                    && sm.ModuleId == (int)ModuleType.GestoresVentas))
                .Should().Be(0, "el módulo es opt-in: una tienda nueva no lo recibe automáticamente");

            (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .CountAsync(srf => srf.StoreId == fixture.StoreId
                    && srf.FeatureId == (int)FeatureType.GestoresVentas))
                .Should().Be(0, "sin StoreModule no hay StoreRoleFeature que generar");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
