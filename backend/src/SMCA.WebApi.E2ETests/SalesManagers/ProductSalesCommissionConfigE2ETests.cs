using System.Net;
using System.Net.Http.Json;
using Application.Dtos.SalesManagers;
using Domain.Common.Enums;
using Domain.Entities.ProductCategories;
using Domain.Entities.ProductSalesCommissions;
using Domain.Entities.Products;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using SMCA.WebApi.E2ETests.Orders;
using Xunit;

namespace SMCA.WebApi.E2ETests.SalesManagers;

/// <summary>
/// T8c: la configuración de comisión por producto a través del endpoint real. Cubre el gate del
/// módulo 21, crear/listar/actualizar/borrar, la persistencia real y que un producto de OTRA
/// tienda del mismo Owner devuelva 404.
/// </summary>
[Collection("e2e")]
public sealed class ProductSalesCommissionConfigE2ETests
{
    private readonly AppTestFactory _f;

    public ProductSalesCommissionConfigE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Owner_configures_updates_lists_and_deletes_a_product_commission()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        Guid otherStoreId = Guid.Empty;
        Guid otherProductId = Guid.Empty;

        try
        {
            using (var scope = _f.Services.CreateScope())
            {
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

                Store otherStore = Store.Create(
                    $"Otra tienda {Guid.NewGuid():N}",
                    fixture.OwnerId,
                    true,
                    fixture.TenantId,
                    DateOnly.FromDateTime(DateTime.UtcNow),
                    storePlanId: (int)StorePlanType.Superior);
                db.Set<Store>().Add(otherStore);

                var otherCategory = ProductCategory.Create(
                    otherStore.Id,
                    "Otra categoría",
                    1,
                    fixture.TenantId,
                    slug: $"otra-{Guid.NewGuid():N}");
                db.Set<ProductCategory>().Add(otherCategory);

                var otherProduct = Product.Create(
                    $"Otro producto {Guid.NewGuid():N}",
                    otherCategory.Id,
                    100m,
                    1,
                    availableToSale: true,
                    discountFromInventory: true,
                    $"B-{Guid.NewGuid():N}",
                    fixture.TenantId);
                db.Set<Product>().Add(otherProduct);

                await db.SaveChangesAsync();
                otherStoreId = otherStore.Id;
                otherProductId = otherProduct.Id;
            }

            var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var create = await ownerClient.PutAsJsonAsync(
                $"/api/v1/ProductSalesCommissions/{fixture.ProductId}",
                new
                {
                    Type = (int)SalesCommissionType.Percentage,
                    Value = 10m,
                    Currency = (int)Currency.CUP,
                });
            create.StatusCode.Should().Be(HttpStatusCode.OK);

            var list = await ownerClient.GetAsync("/api/v1/ProductSalesCommissions");
            list.StatusCode.Should().Be(HttpStatusCode.OK);
            var listed = await list.Content
                .ReadFromJsonAsync<ApiResponse<List<ProductSalesCommissionDto>>>(ApiResponse.Json);
            listed!.Data.Should().ContainSingle(c =>
                c.ProductId == fixture.ProductId
                && c.Type == SalesCommissionType.Percentage
                && c.Value == 10m
                && c.Currency == Currency.CUP);

            var update = await ownerClient.PutAsJsonAsync(
                $"/api/v1/ProductSalesCommissions/{fixture.ProductId}",
                new
                {
                    Type = (int)SalesCommissionType.Fixed,
                    Value = 5m,
                    Currency = (int)Currency.USD,
                });
            update.StatusCode.Should().Be(HttpStatusCode.OK);

            var updated = await ownerClient.GetAsync("/api/v1/ProductSalesCommissions");
            var updatedBody = await updated.Content
                .ReadFromJsonAsync<ApiResponse<List<ProductSalesCommissionDto>>>(ApiResponse.Json);
            updatedBody!.Data.Should().ContainSingle(c =>
                c.ProductId == fixture.ProductId
                && c.Type == SalesCommissionType.Fixed
                && c.Value == 5m
                && c.Currency == Currency.USD);

            var foreign = await ownerClient.PutAsJsonAsync(
                $"/api/v1/ProductSalesCommissions/{otherProductId}",
                new
                {
                    Type = (int)SalesCommissionType.Fixed,
                    Value = 5m,
                    Currency = (int)Currency.CUP,
                });
            foreign.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "el producto pertenece a otra tienda, aunque sea del mismo Owner");

            var deleted = await ownerClient.DeleteAsync(
                $"/api/v1/ProductSalesCommissions/{fixture.ProductId}");
            deleted.StatusCode.Should().Be(HttpStatusCode.OK);

            var empty = await ownerClient.GetAsync("/api/v1/ProductSalesCommissions");
            var emptyBody = await empty.Content
                .ReadFromJsonAsync<ApiResponse<List<ProductSalesCommissionDto>>>(ApiResponse.Json);
            emptyBody!.Data.Should().BeEmpty();
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<ProductSalesCommission>().IgnoreQueryFilters()
                    .Where(x => x.ProductId == fixture.ProductId).ExecuteDeleteAsync();
                await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                    .Where(x => x.StoreId == fixture.StoreId
                        && x.FeatureId == (int)FeatureType.GestoresVentas)
                    .ExecuteDeleteAsync();
                await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(x => x.StoreId == fixture.StoreId
                        && x.ModuleId == (int)ModuleType.GestoresVentas)
                    .ExecuteDeleteAsync();

                if (otherProductId != Guid.Empty)
                {
                    await db.Set<Product>().IgnoreQueryFilters()
                        .Where(x => x.Id == otherProductId).ExecuteDeleteAsync();
                    await db.Set<ProductCategory>().IgnoreQueryFilters()
                        .Where(x => x.StoreId == otherStoreId).ExecuteDeleteAsync();
                }
                if (otherStoreId != Guid.Empty)
                {
                    await db.Set<Store>().IgnoreQueryFilters()
                        .Where(x => x.Id == otherStoreId).ExecuteDeleteAsync();
                }
            }

            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
