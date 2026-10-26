using Domain.Common.Repositories;
using Domain.Entities.SiteTelemetry;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Eventos anónimos del sitio público (páginas públicas y manual de usuario). Es una tabla
    /// append-only y site-wide: no cuelga de una tienda, así que no hay lectura agregada todavía.
    ///
    /// No expone consultas propias a propósito: mientras el producto no pida un panel, la única
    /// operación es el alta (beacon de página y middleware del manual).
    /// </summary>
    public interface ISiteEventRepository : IGenericRepository<SiteEvent, Guid>
    {
    }
}
