using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Comportamiento del repositorio del showcase que SOLO se puede probar contra PostgreSQL real
/// (advisories R3-RepoMethodsUntested / R3-LockUntested de la revisión del Controller 3):
///
///   * <c>SetOrderIndexAsync</c> marca SOLO <c>OrderIndex</c>, así que no revierte una columna que
///     otra petición cambió entre la lectura y el guardado. Con InMemory no se puede probar un UPDATE
///     parcial (no hay SQL), así que la prueba real es aquí.
///   * <c>AcquireSetLockAsync</c> toma un lock de transacción por (tienda, conjunto) y lo libera al
///     cerrar la transacción, sin bloquear tiendas ni conjuntos distintos.
/// </summary>
[Collection("e2e")]
public sealed class ShowcaseRepositoryPersistenceTests
{
    private readonly AppTestFactory _f;

    public ShowcaseRepositoryPersistenceTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task SetOrderIndexAsync_OnAStaleRow_ShouldUpdateOnlyOrderIndexAndPreserveOtherColumns()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        Guid id = Guid.NewGuid();

        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreCatalogImage>().Add(StoreCatalogImage.Create(
                    id, fixture.StoreId, fixture.TenantId, StoreCatalogImageKind.Carousel,
                    $"{fixture.TenantId:N}/{fixture.StoreId:N}/catalog/carousel/{id:N}.png", 0, "Pie original"));
                await db.SaveChangesAsync();
            }

            // Copia "vieja" (lo que el reordenado tendría cargado) + un cambio CONCURRENTE de otra
            // petición en OTRA columna. Con el UpdateAsync de fila completa, este cambio se perdería.
            StoreCatalogImage stale;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                stale = await db.Set<StoreCatalogImage>().IgnoreQueryFilters().AsNoTracking().SingleAsync(i => i.Id == id);
                await db.Set<StoreCatalogImage>().IgnoreQueryFilters().Where(i => i.Id == id)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(i => i.Caption, "Pie de otra petición"));
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await new StoreCatalogImageRepository(db).SetOrderIndexAsync(stale, 5);
                await db.SaveChangesAsync();
            }

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var after = await db.Set<StoreCatalogImage>().IgnoreQueryFilters().AsNoTracking().SingleAsync(i => i.Id == id);

                after.OrderIndex.Should().Be(5);
                after.Caption.Should().Be("Pie de otra petición",
                    "el reordenado no puede revertir una columna que no tocó");
                after.IsActive.Should().BeTrue();
            }
        }
        finally
        {
            await DeleteImageAsync(id);
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task AcquireSetLockAsync_ShouldHoldTheLockUntilTheTransactionEnds()
    {
        Guid storeId = Guid.NewGuid();
        const StoreCatalogImageKind kind = StoreCatalogImageKind.Carousel;

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await using var transaction = await db.Database.BeginTransactionAsync();
        await new StoreCatalogImageRepository(db).AcquireSetLockAsync(storeId, kind, CancellationToken.None);

        // Otra conexión ve el lock TOMADO para el mismo (tienda, conjunto)...
        (await TryAcquireAsync(storeId, kind)).Should().BeFalse();

        await transaction.RollbackAsync();

        // ...y LIBRE en cuanto la transacción dueña termina.
        (await TryAcquireAsync(storeId, kind)).Should().BeTrue();
    }

    [Fact]
    public async Task AcquireSetLockAsync_ShouldNotBlockAnotherStoreOrAnotherSet()
    {
        Guid storeId = Guid.NewGuid();

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await using var transaction = await db.Database.BeginTransactionAsync();
        await new StoreCatalogImageRepository(db).AcquireSetLockAsync(
            storeId, StoreCatalogImageKind.Carousel, CancellationToken.None);

        (await TryAcquireAsync(storeId, StoreCatalogImageKind.Daily)).Should().BeTrue();
        (await TryAcquireAsync(Guid.NewGuid(), StoreCatalogImageKind.Carousel)).Should().BeTrue();

        await transaction.RollbackAsync();
    }

    /// <summary>
    /// Prueba el lock desde una conexión DISTINTA con la MISMA clave que compone el repositorio
    /// (<c>"{storeId}:{(int)kind}"</c>): si el dueño lo tiene, devuelve false; si no, true.
    /// </summary>
    private async Task<bool> TryAcquireAsync(Guid storeId, StoreCatalogImageKind kind)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        string key = $"{storeId}:{(int)kind}";

        return await db.Database
            .SqlQuery<bool>($"SELECT pg_try_advisory_xact_lock(hashtext({key})) AS \"Value\"")
            .SingleAsync();
    }

    private async Task DeleteImageAsync(Guid id)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<StoreCatalogImage>().IgnoreQueryFilters().Where(i => i.Id == id).ExecuteDeleteAsync();
    }
}
