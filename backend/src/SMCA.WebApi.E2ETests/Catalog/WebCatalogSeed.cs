using Application.Abstractions.Authentication;
using Domain.Common.Catalog;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Entities.WebCatalog;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Datos comunes de los E2E del módulo WebCatalog (módulo 18, plan 2026-09-27): una tienda con el
/// módulo contratado y su Owner, más helpers para publicar categorías/productos en el catálogo.
/// </summary>
internal static class WebCatalogSeed
{
    public const int WebCatalogModuleId = 18;
    public const int WebCatalogFeatureId = 122;
    public const string Password = "Password123";

    public sealed record StoreFixture(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId, string StoreName)
    {
        /// <summary>El slug público esperado: el mismo normalizador que usa el backend.</summary>
        public string Slug => SlugNormalizer.Normalize(StoreName);
    }

    /// <summary>
    /// Owner con su tienda en plan Superior. El nombre de la tienda incluye un guid para que el slug
    /// público sea determinista aunque la base acumule tiendas de corridas anteriores.
    /// </summary>
    public static async Task<StoreFixture> SeedOwnerAsync(AppTestFactory factory, bool withWebCatalogModule = true)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"wcat-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E WebCatalog Owner", "0000000000", login, tenantId);
        user.OfflinePasswordPreHash = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>()
            .Protect(Password, user.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E WebCatalog owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        string storeName = $"Tienda {Guid.NewGuid():N}";
        var store = Store.Create(storeName, owner.Id, true, tenantId, DateOnly.FromDateTime(DateTime.UtcNow),
            storePlanId: (int)StorePlanType.Superior);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Módulo de Ventas (2): lo necesita cualquier tienda con productos, y es el que habilita
        // PUT /v1/products/{id} para editar los campos del catálogo (dueño de FeatureType.Products).
        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, (int)ModuleType.Sales, 0, true, 0, 0, 0, tenantId));

        if (withWebCatalogModule)
        {
            // Mismo snapshot que deja el plan Superior (precio 5, 100 % de descuento => precio 0).
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, WebCatalogModuleId, 5, false, 5, 0, 100, tenantId));
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                store.Id, (int)RoleType.OwnerAdmin, WebCatalogFeatureId, tenantId));
        }

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();

        return new StoreFixture(user.Id, login, owner.Id, store.Id, tenantId, storeName);
    }

    public static async Task<ProductCategory> AddCategoryAsync(AppTestFactory factory, StoreFixture fixture,
        string name, int order = 1)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var category = ProductCategory.Create(fixture.StoreId, name, order, fixture.TenantId);
        db.Set<ProductCategory>().Add(category);
        await db.SaveChangesAsync();
        return category;
    }

    public static async Task<Product> AddProductAsync(AppTestFactory factory, StoreFixture fixture, Guid categoryId,
        string name, decimal price, int order = 1, bool availableToSale = true,
        string description = "", int percentDiscountPrice = 0, int discountPrice = 0,
        bool isNew = false, string? image = null, IEnumerable<string>? gallery = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var product = Product.Create(name, categoryId, price, order, availableToSale, true, $"B-{Guid.NewGuid():N}",
            fixture.TenantId, description, percentDiscountPrice, discountPrice, isNew, image);
        db.Set<Product>().Add(product);

        int galleryOrder = 0;
        foreach (string path in gallery ?? Enumerable.Empty<string>())
            db.Set<ProductImage>().Add(ProductImage.Create(product.Id, path, galleryOrder++, fixture.TenantId));

        await db.SaveChangesAsync();
        return product;
    }

    /// <summary>Sirve un archivo para el POST multipart (jpg/png válidos o basura para el caso negativo).</summary>
    public static MultipartFormDataContent BuildImageUpload(byte[] bytes, string fileName, string contentType)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    /// <summary>Borrar las filas del catálogo y del origen de ESTA tienda, y luego el grafo de la tienda.</summary>
    public static async Task CleanupAsync(AppTestFactory factory, StoreFixture fixture)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var catalogProductIds = await db.Set<CatalogProduct>().IgnoreQueryFilters()
            .Where(product => product.StoreId == fixture.StoreId)
            .Select(product => product.Id).ToListAsync();
        await db.Set<CatalogProductImage>().IgnoreQueryFilters()
            .Where(image => catalogProductIds.Contains(image.CatalogProductId)).ExecuteDeleteAsync();
        await db.Set<CatalogProduct>().IgnoreQueryFilters()
            .Where(product => product.StoreId == fixture.StoreId).ExecuteDeleteAsync();
        await db.Set<CatalogCategory>().IgnoreQueryFilters()
            .Where(category => category.StoreId == fixture.StoreId).ExecuteDeleteAsync();

        var sourceProductIds = await db.Set<Product>().IgnoreQueryFilters()
            .Where(product => product.Category.StoreId == fixture.StoreId)
            .Select(product => product.Id).ToListAsync();
        await db.Set<ProductImage>().IgnoreQueryFilters()
            .Where(image => sourceProductIds.Contains(image.ProductId)).ExecuteDeleteAsync();
        await db.Set<Product>().IgnoreQueryFilters()
            .Where(product => sourceProductIds.Contains(product.Id)).ExecuteDeleteAsync();
        await db.Set<ProductCategory>().IgnoreQueryFilters()
            .Where(category => category.StoreId == fixture.StoreId).ExecuteDeleteAsync();

        await AuthzSeed.CleanupStoreGraphAsync(factory, fixture.StoreId, fixture.UserId);
    }
}

// Formas de las respuestas que consumen los tests (deserialización case-insensitive).
internal sealed record SyncSummaryDto(string StoreSlug, string CatalogUrl, DateTime SyncedAt,
    int CategoriesCreated, int CategoriesUpdated, int ProductsCreated, int ProductsUpdated, int ProductsDeactivated);

internal sealed record CatalogStatusDto(string StoreSlug, string CatalogUrl, DateTime? CatalogSyncedAt,
    int SourceCategoriesCount, int SourceProductsCount, int PublishedProductsCount, int ProductsWithoutMainImageCount);

internal sealed record PublicCatalogDto(Guid StoreId, string StoreName, string StoreSlug,
    List<PublicCategoryDto> Categories);

internal sealed record PublicCategoryDto(Guid Id, string Name, string Slug, int ProductsCount);

internal sealed record PublicProductDto(Guid Id, string Name, string Description, decimal Price, decimal FinalPrice,
    bool HasDiscount, int PercentDiscountPrice, decimal PercentDiscount, int DiscountPrice, decimal DiscountAmount,
    bool IsNew, string Currency, Guid CategoryId, string CategoryName, string CategorySlug,
    string? ImageUrl, List<string> ImageUrls);

internal sealed record PublicPageDto(List<PublicProductDto> Items, int Total, int Page, int PageSize);
