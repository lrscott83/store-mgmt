using System.Security.Cryptography;
using System.Text;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Hashes anónimos de la telemetría del catálogo. No se guarda la IP ni el User-Agent: solo
    /// estas huellas, calculadas en el servidor.
    ///
    /// `VisitorHash` usa la fecha UTC como sal: el mismo visitante recibe una huella distinta cada
    /// día, que es lo que permite contar únicos diarios sin cookies ni identificadores persistentes.
    /// `SessionHash` añade una ventana de 30 minutos para agrupar los eventos de una visita.
    /// </summary>
    public static class CatalogTelemetryHash
    {
        private static readonly TimeSpan SessionWindow = TimeSpan.FromMinutes(30);

        public static string Visitor(Guid storeId, string? ipAddress, string? userAgent, DateTime utcNow)
        {
            string day = utcNow.ToString("yyyy-MM-dd");
            return Sha256($"{storeId:N}|{day}|{ipAddress ?? string.Empty}|{userAgent ?? string.Empty}");
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
