using Domain.Entities.Orders;
using Domain.Entities.StoreCatalogSettings;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

/// <summary>
/// Lecturas de comprobación compartidas por los E2E de pedidos y de catálogo web.
///
/// Todas saltan el filtro global por tenant: el scope de un test no lleva tenant en el contexto, y
/// sin <c>IgnoreQueryFilters</c> la lectura devolvería null y culparía al handler de un problema del
/// filtro. Son <c>AsNoTracking</c> para no interferir con el seguimiento de la petición que se está
/// verificando.
///
/// Existen en UN solo sitio porque cuatro suites nuevas necesitaban exactamente la misma lectura.
/// El scope y la resolución del contexto viven en <see cref="QueryAsync{T}"/>: cada método público
/// solo declara lo que de verdad lo distingue (entidad, filtro y proyección).
/// </summary>
internal static class OrderingQueries
{
    private static async Task<T> QueryAsync<T>(
        AppTestFactory factory, Func<ApplicationDbContext, Task<T>> query)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await query(db);
    }

    public static Task<StoreCatalogSettings?> ReadSettingsRowAsync(AppTestFactory factory, Guid storeId)
        => QueryAsync(factory, db => db.Set<StoreCatalogSettings>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(settings => settings.StoreId == storeId));

    public static Task<int> CountSettingsRowsAsync(AppTestFactory factory, Guid storeId)
        => QueryAsync(factory, db => db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .CountAsync(settings => settings.StoreId == storeId));

    public static Task<Order?> ReadOrderRowAsync(AppTestFactory factory, Guid orderId)
        => QueryAsync(factory, db => db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(order => order.Id == orderId));

    public static Task<int> CountOrdersAsync(AppTestFactory factory, Guid storeId)
        => QueryAsync(factory, db => db.Set<Order>().IgnoreQueryFilters()
            .CountAsync(order => order.StoreId == storeId));
}
