using System.Security.Cryptography;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// T6: firma (SHA-256) del shell del SPA publicado en el volumen compartido. El sincronizador
    /// la compara en cada comprobación: firma distinta = build nuevo = hay que regenerar las páginas
    /// (S9). <c>null</c> cuando todavía no hay shell (el frontend aún no arrancó en ese entorno).
    /// </summary>
    public static class CatalogStaticPageShellSignature
    {
        public static string? Compute(string? shellPath)
        {
            if (string.IsNullOrWhiteSpace(shellPath) || !File.Exists(shellPath))
                return null;

            using var stream = File.OpenRead(shellPath);
            return Convert.ToHexString(SHA256.HashData(stream));
        }
    }
}
