using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using Domain.Entities.Owners;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Seed LOCAL de los E2E del pedido online anónimo (F3). No toca `WebCatalogSeed` ni
/// `AuthzSeed`: son archivos del harness compartido y este suite necesita filas que ellos no
/// crean — el `StoreCatalogSettings` con los pedidos ABIERTOS y un `Order` con líneas.
///
/// Lo que se siembra, y por qué cada cosa es necesaria:
///
///   * Tienda con <c>CatalogSlug</c> ya asignado. Es lo único que resuelve
///     `GET /api/v1/public/ordering/{storeSlug}/…` sin sesión: los endpoints son anónimos y
///     <c>GetStoreByCatalogSlugAsync</c> exige `CatalogSlug != null`. El slug se fija EN EL ALTA
///     (no con un UPDATE posterior) porque `ApplicationDbContext` es NoTracking.
///   * <c>StoreCatalogSettings</c> con `Enabled` y `PickupEnabled`: sin la fila,
///     `CreateOnlineOrderCommandHandler` responde 400 "pedidos no habilitados" y nunca se llega
///     al rate limit.
///   * Producto en una categoría CON slug: `GetPublishedByIdsAsync` exige producto activo y en
///     venta de categoría activa con slug público.
///   * (opcional) Un `Order` creado con `Order.CreateOnline` + líneas, para la lectura pública por
///     código.
///
/// El precio del producto es 100 sin descuentos, así que `Product.FinalPrice` = 100 y el importe
/// esperado de cualquier línea es calculable sin depender de la fórmula de descuentos.
/// </summary>
internal static class PublicOrderingSeed
{
    public const string Password = "Password123";

    /// <summary>Precio del producto sembrado. Sin descuentos, `FinalPrice` == 100.</summary>
    public const decimal ProductPrice = 100m;

    /// <summary>Unidades de la línea sembrada. 2 × 100 = 200 de total.</summary>
    public const int SeededQuantity = 2;

    /// <summary>Total esperado del pedido sembrado (ProductPrice × SeededQuantity).</summary>
    public const decimal SeededTotal = ProductPrice * SeededQuantity;

    public sealed record OrderingFixture(
        Guid UserId,
        string Login,
        Guid OwnerId,
        Guid StoreId,
        Guid TenantId,
        string Slug,
        Guid ProductId,
        string ProductName)
    {
        /// <summary>Teléfono del cliente sembrado: el segundo factor de la lectura pública.</summary>
        public string Phone => "+5355555555";
    }

    /// <summary>
    /// Owner + tienda con catálogo público + producto publicado + pedidos abiertos. Todo con GUIDs
    /// fresh, así que el slug nunca choca con el de otra corrida ni con otra tienda del mismo test
    /// (el slug es la clave de partición del rate limit).
    /// </summary>
    public static async Task<OrderingFixture> SeedAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"porder-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E PublicOrdering Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E PublicOrdering owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        // Slug fijo y minúsculo: lo que `SlugNormalizer` produciría, escrito a mano para que el
        // test no dependa del normalizador ni del POST de sincronización del catálogo.
        string slug = $"e2e-pedidos-{Guid.NewGuid():N}";

        var store = Store.Create($"E2E Pedidos {Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow), storePlanId: (int)StorePlanType.Superior);
        store.CatalogSlug = slug;
        db.Set<Store>().Add(store);

        var category = ProductCategory.Create(store.Id, "E2E Pedidos", 1, tenantId,
            slug: $"e2e-categoria-{Guid.NewGuid():N}");
        db.Set<ProductCategory>().Add(category);
        await db.SaveChangesAsync();

        var product = Product.Create($"E2E Producto {Guid.NewGuid():N}", category.Id, ProductPrice, 1,
            availableToSale: true, discountFromInventory: true, $"B-{Guid.NewGuid():N}", tenantId);
        db.Set<Product>().Add(product);

        var settings = StoreCatalogSettings.Create(store.Id, tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        settings.DeliveryEnabled = true;
        settings.WhatsappNumber = "+5355555555";
        db.Set<StoreCatalogSettings>().Add(settings);

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();

        return new OrderingFixture(user.Id, login, owner.Id, store.Id, tenantId, slug, product.Id, product.Name);
    }

    /// <summary>
    /// Un pedido online de la tienda con UNA línea de <see cref="ProductPrice"/> y
    /// <see cref="SeededQuantity"/> unidades, guardado con la vía de producción
    /// (`Order.CreateOnline`): nace `New`/`Pending`, `Pickup`, y su snapshot en `OrderItem`.
    ///
    /// El alta es un `.Add` explícito porque `ApplicationDbContext` es NoTracking: una entidad
    /// creada, mutada y guardada sin `.Add` NO se escribe — sin error y sin aviso.
    /// </summary>
    public static async Task<Order> SeedOnlineOrderAsync(
        AppTestFactory factory, OrderingFixture fixture, string code)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var order = Order.CreateOnline(
            fixture.StoreId,
            fixture.TenantId,
            code,
            OrderDeliveryType.Pickup,
            customerName: "Cliente Anónimo E2E",
            customerPhone: fixture.Phone,
            total: SeededTotal,
            currency: Currency.CUP,
            [new OrderLine(fixture.ProductId, fixture.ProductName, SeededQuantity, ProductPrice, Currency.CUP)],
            description: null,
            deliveryAddress: null,
            notes: "pedido sembrado por el E2E");

        db.Set<Order>().Add(order);
        await db.SaveChangesAsync();
        return order;
    }

    /// <summary>
    /// Cuerpo del POST público. Mismo contrato que el carrito del storefront: sin precios y sin
    /// total — eso los pone el servidor leyendo el catálogo.
    /// </summary>
    public static object CreateOrderBody(Guid productId, string phone) => new
    {
        deliveryType = (int)OrderDeliveryType.Pickup,
        customerName = "Cliente Anónimo E2E",
        customerPhone = phone,
        items = new[] { new { productId, quantity = 1 } },
    };

    /// <summary>
    /// Borra lo sembrado en orden de FK (todas son Restrict): `OrderItem` antes que `Order` antes
    /// que la tienda. `IgnoreQueryFilters` en todas: las tres tablas tienen filtro global por
    /// tenant y el scope del test no tiene tenant en el contexto.
    /// </summary>
    public static async Task CleanupAsync(AppTestFactory factory, OrderingFixture fixture)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<OrderItem>().IgnoreQueryFilters()
            .Where(item => item.Order.StoreId == fixture.StoreId).ExecuteDeleteAsync();
        await db.Set<Order>().IgnoreQueryFilters()
            .Where(order => order.StoreId == fixture.StoreId).ExecuteDeleteAsync();
        await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .Where(settings => settings.StoreId == fixture.StoreId).ExecuteDeleteAsync();
        await db.Set<Product>().IgnoreQueryFilters()
            .Where(product => product.Category.StoreId == fixture.StoreId).ExecuteDeleteAsync();
        await db.Set<ProductCategory>().IgnoreQueryFilters()
            .Where(category => category.StoreId == fixture.StoreId).ExecuteDeleteAsync();

        await AuthzSeed.CleanupStoreGraphAsync(factory, fixture.StoreId, fixture.UserId);
    }
}
