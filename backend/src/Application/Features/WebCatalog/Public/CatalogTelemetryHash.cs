using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Hashes anónimos de la telemetría del catálogo. No se guarda la IP ni el User-Agent: solo
    /// estas huellas, calculadas en el servidor.
    ///
    /// `VisitorHash` usa la fecha UTC como sal y un secreto de configuración: el mismo visitante
    /// recibe una huella distinta cada día, y sin el secreto no se puede reconstruir la huella
    /// enumerando IPs y User-Agents. `SessionHash` añade una ventana de 30 minutos para agrupar
    /// los eventos de una visita.
    /// </summary>
    public static class CatalogTelemetryHash
    {
        private static readonly TimeSpan SessionWindow = TimeSpan.FromMinutes(30);

        public static string Visitor(Guid storeId, string? ipAddress, string? userAgent, DateTime utcNow,
            string? salt = null)
        {
            string day = utcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            string secret = string.IsNullOrWhiteSpace(salt) ? "catalog-telemetry" : salt;
            return Sha256($"{secret}|{storeId:N}|{day}|{ipAddress ?? string.Empty}|{userAgent ?? string.Empty}");
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
