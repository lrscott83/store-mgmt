using Domain.Entities.StoreCatalogSettings;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// La fila de configuración la comparten PEDIDOS y MARCA (D19), pero cada vista escribe solo sus
/// columnas. Antes el upsert marcaba la fila ENTERA (`EntityState.Modified`): guardar los pedidos
/// reescribía la marca con los valores que se leyeron al cargar, revirtiendo un cambio de marca
/// concurrente — el logo "desaparecía". Ese UPDATE parcial solo se puede probar contra PostgreSQL
/// real (con InMemory no hay SQL que inspeccionar).
/// </summary>
[Collection("e2e")]
public sealed class StoreCatalogSettingsPartialUpsertE2ETests
{
    private readonly AppTestFactory _f;

    public StoreCatalogSettingsPartialUpsertE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Upsert_with_only_ordering_columns_should_preserve_a_concurrent_brand_change()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);

        try
        {
            // El seed ya deja la fila; se le fija una marca conocida y pedidos apagados.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
                    .Where(s => s.StoreId == fixture.StoreId)
                    .ExecuteUpdateAsync(setters => setters
                        .SetProperty(s => s.LogoKey, "brand/logo-old.png")
                        .SetProperty(s => s.Enabled, false));
            }

            // Copia "vieja" (lo que el guardado de pedidos tendría cargado) + un cambio CONCURRENTE de
            // la marca en la misma fila.
            StoreCatalogSettings stale;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                stale = await db.Set<StoreCatalogSettings>().IgnoreQueryFilters().AsNoTracking()
                    .SingleAsync(s => s.StoreId == fixture.StoreId);

                await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
                    .Where(s => s.StoreId == fixture.StoreId)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(s => s.LogoKey, "brand/logo-new.png"));
            }

            // El guardado de PEDIDOS toca solo sus columnas.
            stale.Enabled = true;
            DateTimeOffset stamp = DateTimeOffset.UtcNow.AddSeconds(-1);
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await new StoreCatalogSettingsRepository(db).UpsertAsync(
                    stale, exists: true, nameof(StoreCatalogSettings.Enabled));
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var after = await db.Set<StoreCatalogSettings>().IgnoreQueryFilters().AsNoTracking()
                    .SingleAsync(s => s.StoreId == fixture.StoreId);

                after.Enabled.Should().BeTrue("la columna de pedidos sí se escribió");
                after.LogoKey.Should().Be("brand/logo-new.png",
                    "el guardado de pedidos no puede revertir un cambio de marca que no tocó");
                // El UPDATE parcial deja la entidad en `Modified`, así que `SetAuditableColumns`
                // (ApplicationDbContext.SaveChangesAsync) sella `UpdatedDate` igual que la fila completa.
                after.UpdatedDate.Should().NotBeNull("la auditoría se sella en SaveChanges");
                after.UpdatedDate!.Value.Should().BeOnOrAfter(stamp);
            }
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
