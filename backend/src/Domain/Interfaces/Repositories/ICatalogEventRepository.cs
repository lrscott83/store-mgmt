using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.CatalogEvents;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Eventos anónimos del catálogo público y su agregado para el panel de estadísticas.
    ///
    /// La escritura es un alta por lote (el endpoint público recibe hasta 10 eventos por request);
    /// la lectura es SOLO del SuperAdmin, por tienda y rango de fechas, o agregada para todas las
    /// tiendas del panel general.
    /// </summary>
    public interface ICatalogEventRepository : IGenericRepository<CatalogEvent, Guid>
    {
        Task<CatalogStatsSnapshot> GetStatsAsync(Guid storeId, DateTime fromUtc, DateTime toUtc,
            CancellationToken cancellationToken);

        /// <summary>
        /// Agregado de TODAS las tiendas en un rango, con el desglose por tienda que alimenta el
        /// selector del panel general. Es el mismo trabajo de agregación, sin filtro por tienda.
        /// </summary>
        Task<CatalogOverviewSnapshot> GetOverviewStatsAsync(DateTime fromUtc, DateTime toUtc,
            CancellationToken cancellationToken);
    }

    public sealed record CatalogSourceVisits(CatalogSource Source, int Visits);

    /// <summary>Visitas de una tienda en el periodo, para el selector del panel general.</summary>
    public sealed record CatalogStoreVisits(Guid StoreId, string Name, int Visits);

    public sealed record CatalogProductViews(Guid ProductId, int Views);

    public sealed record CatalogDayVisits(DateTime Day, int Visits);

    /// <summary>
    /// Agregado crudo de una tienda en un rango. El handler lo convierte en el DTO y resuelve los
    /// nombres de producto; el repositorio no conoce el contrato HTTP.
    /// </summary>
    public sealed record CatalogStatsSnapshot(
        int PageViews,
        int Visits,
        int Visitors,
        IReadOnlyList<CatalogSourceVisits> Sources,
        IReadOnlyList<CatalogProductViews> TopProducts,
        IReadOnlyList<CatalogDayVisits> Daily);

    /// <summary>
    /// Agregado general de todas las tiendas en un rango: el total del panel y las tiendas que
    /// tuvieron visitas en ese mismo rango (todas con `Visits > 0`).
    /// </summary>
    public sealed record CatalogOverviewSnapshot(
        CatalogStatsSnapshot Totals,
        IReadOnlyList<CatalogStoreVisits> Stores);
}
