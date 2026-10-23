using Domain.Common.Enums;

namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Una fila del CSV de importación del catálogo web (SuperAdmin). El navegador ya la normalizó
    /// con `parseCsvProducts`; el backend la revalida porque no confía en el cliente (S7).
    ///
    /// `Currency` ausente => CUP (default del dominio). Un valor FUERA del enum NO cae a CUP: la
    /// fila se rechaza con 400 y el import completo no se aplica (misma regla S7).
    /// </summary>
    public sealed record CatalogCsvRowDto(
        string CategoryName,
        string ProductName,
        decimal Price,
        Currency? Currency = null);

    /// <summary>
    /// Resumen del import: lo que se creó y lo que se actualizó. Solo precio y moneda se tocan en
    /// los existentes (decisión del owner, 2026-10-22).
    /// </summary>
    public sealed record CatalogCsvImportSummaryDto(
        int CategoriesCreated,
        int ProductsCreated,
        int ProductsUpdated,
        int RowsProcessed);
}
