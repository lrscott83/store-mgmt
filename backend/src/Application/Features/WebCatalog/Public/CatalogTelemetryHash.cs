using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Application.Common.Telemetry;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Hashes anónimos de la telemetría. No se guarda la IP ni el User-Agent: solo estas huellas,
    /// calculadas en el servidor.
    ///
    /// `VisitorHash` mezcla la clave compartida de telemetría (`TelemetryHashKey`) con la fecha
    /// UTC: el mismo visitante recibe una huella distinta cada día. `SessionHash` añade una
    /// ventana de 30 minutos para agrupar los eventos de una visita.
    ///
    /// La clave está en el código por decisión de producto y es la MISMA para el catálogo y para
    /// las páginas públicas del sitio.
    /// </summary>
    public static class CatalogTelemetryHash
    {
        private static readonly TimeSpan SessionWindow = TimeSpan.FromMinutes(30);

        public static string Visitor(Guid storeId, string? ipAddress, string? userAgent, DateTime utcNow)
        {
            string day = utcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            return Sha256(
                $"{TelemetryHashKey.Value}|{storeId:N}|{day}|{ipAddress ?? string.Empty}|{userAgent ?? string.Empty}");
        }

        public static string Session(Guid storeId, string visitorHash, DateTime utcNow)
        {
            long window = utcNow.Ticks / SessionWindow.Ticks;
            return Sha256($"{storeId:N}|{visitorHash}|{window}");
        }

        private static string Sha256(string value)
        {
            byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}
