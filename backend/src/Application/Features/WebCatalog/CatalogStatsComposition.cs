using Application.Dtos.WebCatalog;
using Domain.Common.Enums;
using Domain.Interfaces.Repositories;

namespace Application.Features.WebCatalog
{
    /// <summary>
    /// Piezas compartidas por las dos lecturas del panel de estadísticas: la de UNA tienda y la
    /// GENERAL. La ventana y la forma del DTO son el mismo contrato; si la serie diaria se densifica
    /// de una manera, se densifica igual en las dos vistas. Vive aquí, y no en una de las queries,
    /// para que ninguna de las dos sea la "dueña" de la regla.
    /// </summary>
    public static class CatalogStatsComposition
    {
        public const int DefaultDays = 30;
        public const int MaxDays = 365;

        /// <summary>Días efectivos: valores no positivos caen al default y el techo es un año.</summary>
        public static int ResolveDays(int requestedDays)
            => Math.Clamp(requestedDays <= 0 ? DefaultDays : requestedDays, 1, MaxDays);

        /// <summary>
        /// Ventana inclusiva de `days` días calendario UTC, terminando hoy. El evento y el pedido
        /// usan el MISMO rango, para que la conversión no mezcle peras con manzanas.
        /// </summary>
        public static (DateTime FromUtc, DateTime ToUtc) ResolveWindow(int days)
        {
            DateTime toUtc = DateTime.UtcNow;
            return (toUtc.Date.AddDays(-(days - 1)), toUtc);
        }

        /// <summary>Todos los orígenes del enum, con 0 donde no hubo visitas.</summary>
        public static IReadOnlyList<CatalogSourceStatsDto> DenseSources(CatalogStatsSnapshot snapshot)
        {
            Dictionary<CatalogSource, int> visitsBySource = snapshot.Sources
                .ToDictionary(source => source.Source, source => source.Visits);

            return Enum.GetValues<CatalogSource>()
                .Select(source => new CatalogSourceStatsDto(source, visitsBySource.GetValueOrDefault(source)))
                .ToList();
        }

        /// <summary>Serie diaria densa: un punto por cada día de la ventana, 0 incluido.</summary>
        public static List<CatalogDayStatsDto> DenseDaily(IReadOnlyList<CatalogDayVisits> daily,
            DateTime fromUtc, DateTime toUtc)
        {
            Dictionary<DateTime, int> visitsByDay = daily
                .ToDictionary(day => day.Day.Date, day => day.Visits);

            var result = new List<CatalogDayStatsDto>((toUtc.Date - fromUtc.Date).Days + 1);
            for (DateTime day = fromUtc.Date; day <= toUtc.Date; day = day.AddDays(1))
            {
                result.Add(new CatalogDayStatsDto(day, visitsByDay.GetValueOrDefault(day)));
            }

            return result;
        }

        /// <summary>Pedidos / visitas. 0 cuando no hubo visitas.</summary>
        public static double ConversionRate(int visits, int orders)
            => visits == 0 ? 0 : Math.Round((double)orders / visits, 4);
    }
}
