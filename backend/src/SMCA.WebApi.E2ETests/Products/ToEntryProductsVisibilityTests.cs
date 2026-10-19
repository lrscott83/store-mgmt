using System.Net.Http.Json;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Catalog;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Products;

/// <summary>
/// El selector de producto de "Entradas de hoy" (<c>GET /api/v1/Products/toEntry</c>) solo puede
/// ofrecer productos vendibles: ni productos inactivos, ni productos —activos o no— de una
/// categoría inactiva. La categoría es la puerta de la pantalla de venta: si está desactivada,
/// sus productos no se venden y tampoco deben poder elegirse al registrar una entrada.
/// </summary>
[Collection("e2e")]
public sealed class ToEntryProductsVisibilityTests
{
    private readonly AppTestFactory _f;

    public ToEntryProductsVisibilityTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ProductToEntryDto(Guid Id, string FullName);

    [Fact]
    public async Task ToEntry_hides_inactive_products_and_products_of_inactive_categories()
    {
        WebCatalogSeed.StoreFixture fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            ProductCategory activeCategory = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Bebidas", order: 1);
            ProductCategory inactiveCategory = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Postres", order: 2);

            Product visible = await WebCatalogSeed.AddProductAsync(_f, fixture, activeCategory.Id, "Agua", 10m);
            Product inactiveProduct = await WebCatalogSeed.AddProductAsync(_f, fixture, activeCategory.Id,
                "Refresco retirado", 20m);
            Product inactiveCategoryProduct = await WebCatalogSeed.AddProductAsync(_f, fixture, inactiveCategory.Id,
                "Torta", 30m);

            // Precondición: con todo activo, los tres productos están en el selector. Sin esto, un
            // fallo de siembra se confundiría con el filtro funcionando.
            ApiResponse<List<ProductToEntryDto>> before = await GetToEntryAsync(fixture);
            before.Data!.Select(p => p.Id).Should().BeEquivalentTo(
                new[] { visible.Id, inactiveProduct.Id, inactiveCategoryProduct.Id },
                "los tres productos nacen activos y en categorías activas");

            await SetIsActiveAsync<Product>(inactiveProduct.Id, false);
            await SetIsActiveAsync<ProductCategory>(inactiveCategory.Id, false);

            ApiResponse<List<ProductToEntryDto>> after = await GetToEntryAsync(fixture);

            after.Succeeded.Should().BeTrue();
            after.Data!.Select(p => p.Id).Should().BeEquivalentTo(new[] { visible.Id });
            after.Data.Should().NotContain(p => p.Id == inactiveProduct.Id, "el producto está inactivo");
            after.Data.Should().NotContain(p => p.Id == inactiveCategoryProduct.Id,
                "la categoría está inactiva, así que sus productos tampoco se ofrecen");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    private async Task<ApiResponse<List<ProductToEntryDto>>> GetToEntryAsync(WebCatalogSeed.StoreFixture fixture)
    {
        HttpClient client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
        ApiResponse<List<ProductToEntryDto>>? response = await client.GetFromJsonAsync<ApiResponse<List<ProductToEntryDto>>>(
            "/api/v1/Products/toEntry", ApiResponse.Json);
        response!.Succeeded.Should().BeTrue();
        return response;
    }

    /// <summary>
    /// <c>ExecuteUpdateAsync</c> porque <c>ApplicationDbContext</c> es NoTracking por defecto: cargar,
    /// mutar y guardar escribiría NADA, sin error. <c>IgnoreQueryFilters</c> porque las entidades
    /// filtran por tenant y aquí no hay sesión.
    /// </summary>
    private async Task SetIsActiveAsync<TEntity>(Guid id, bool isActive) where TEntity : class
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<TEntity>().IgnoreQueryFilters()
            .Where(entity => EF.Property<Guid>(entity, "Id") == id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(entity => EF.Property<bool>(entity, "IsActive"), isActive));
    }
}
