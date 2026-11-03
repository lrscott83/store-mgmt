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
/// Existen en UN solo sitio porque cuatro suites nuevas necesitaban exactamente la misma lectura;
/// con una copia por archivo, cualquier cambio del fixture habría que buscarlo con grep.
/// </summary>
internal static class OrderingQueries
{
    public static async Task<StoreCatalogSettings?> ReadSettingsRowAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreCatalogSettings>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(settings => settings.StoreId == storeId);
    }

    public static async Task<int> CountSettingsRowsAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .CountAsync(settings => settings.StoreId == storeId);
    }

    public static async Task<Order?> ReadOrderRowAsync(AppTestFactory factory, Guid orderId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(order => order.Id == orderId);
    }

    public static async Task<int> CountOrdersAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Order>().IgnoreQueryFilters().CountAsync(order => order.StoreId == storeId);
    }
}
