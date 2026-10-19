using System.Globalization;
using System.Text.Json;

namespace Application.Services.Stores
{
    /// <summary>
    /// Un rango de apertura de un día. El día usa el nombre schema.org
    /// (<c>Monday</c>..<c>Sunday</c>) para que el JSON guardado y el JSON-LD hablen el mismo
    /// idioma, sin traducción de por medio.
    /// </summary>
    public sealed record OpeningHoursEntry(string Day, string Opens, string Closes);

    /// <summary>
    /// public-catalog-static-pages (T8): formato único del horario público de una tienda.
    /// Se guarda como JSON canónico en <c>Store.OpeningHoursJson</c> y se vuelve a leer para el
    /// JSON-LD del catálogo. El guardado NUNCA confía en el cliente: valida días, horas y rangos
    /// antes de serializar, de modo que una fila guardada siempre es un horario posible.
    /// </summary>
    public static class OpeningHoursSerializer
    {
        private static readonly string[] DayOrder =
        {
            "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
        };

        private static readonly HashSet<string> ValidDays = new(DayOrder, StringComparer.Ordinal);

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        /// <summary>
        /// Valida y canonicaliza el horario. Un conjunto vacío o <c>null</c> es válido y produce
        /// <c>null</c> (la tienda simplemente no publica horario). El error es un código corto
        /// (<c>day</c>, <c>time</c>, <c>range</c>, <c>day-count</c>, <c>count</c>) útil para tests.
        /// </summary>
        public static bool TryNormalize(
            IEnumerable<OpeningHoursEntry>? entries,
            out string? json,
            out string? error)
        {
            json = null;

            if (!TryValidate(entries, out var normalized, out error))
                return false;

            if (normalized.Count == 0)
                return true;

            json = JsonSerializer.Serialize(normalized, JsonOptions);
            return true;
        }

        /// <summary>
        /// Lee el horario guardado. Un JSON ausente, malformado o inválido devuelve una lista
        /// vacía: el JSON-LD omite el horario antes que publicar datos imposibles.
        /// </summary>
        public static IReadOnlyList<OpeningHoursEntry> Parse(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return Array.Empty<OpeningHoursEntry>();

            try
            {
                var entries = JsonSerializer.Deserialize<List<OpeningHoursEntry>>(json, JsonOptions);
                if (entries is null)
                    return Array.Empty<OpeningHoursEntry>();

                return TryValidate(entries, out var normalized, out _)
                    ? normalized
                    : Array.Empty<OpeningHoursEntry>();
            }
            catch (JsonException)
            {
                return Array.Empty<OpeningHoursEntry>();
            }
        }

        private static bool TryValidate(
            IEnumerable<OpeningHoursEntry>? entries,
            out List<OpeningHoursEntry> normalized,
            out string? error)
        {
            normalized = new List<OpeningHoursEntry>();
            error = null;

            if (entries is null)
                return true;

            var perDay = new Dictionary<string, int>(StringComparer.Ordinal);

            foreach (var entry in entries)
            {
                if (entry is null || !ValidDays.Contains(entry.Day))
                {
                    error = "day";
                    return false;
                }

                if (!TryParseTime(entry.Opens, out var opens) ||
                    !TryParseTime(entry.Closes, out var closes))
                {
                    error = "time";
                    return false;
                }

                if (opens >= closes)
                {
                    error = "range";
                    return false;
                }

                perDay.TryGetValue(entry.Day, out var count);
                if (count >= 2)
                {
                    error = "day-count";
                    return false;
                }

                perDay[entry.Day] = count + 1;
                normalized.Add(new OpeningHoursEntry(entry.Day, Format(opens), Format(closes)));
            }

            if (normalized.Count > 14)
            {
                error = "count";
                return false;
            }

            normalized = normalized
                .OrderBy(e => Array.IndexOf(DayOrder, e.Day))
                .ThenBy(e => e.Opens, StringComparer.Ordinal)
                .ToList();

            return true;
        }

        private static bool TryParseTime(string? value, out TimeOnly time) =>
            TimeOnly.TryParseExact(
                value,
                "HH:mm",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out time);

        private static string Format(TimeOnly time) =>
            time.ToString("HH:mm", CultureInfo.InvariantCulture);
    }
}
