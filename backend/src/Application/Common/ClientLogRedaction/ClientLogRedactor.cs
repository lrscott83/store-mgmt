using System.Text.Json;
using System.Text.RegularExpressions;

namespace Application.Common.ClientLogRedaction
{
    /// <summary>
    /// Scrubbing del servidor para las cadenas que se PERSISTEN de un error del cliente POS.
    ///
    /// El POS ya redacta antes de guardar en su buffer local (`lizoft.client-log-v1`), pero eso es
    /// una promesa del cliente: una versión vieja, un `curl` a mano o cualquier integración futura
    /// pueden mandar el token tal cual. La tabla es append-only y la consulta el SuperAdmin, así que
    /// el servidor no puede delegar la garantía de "sin secretos" a quien le envía los datos.
    ///
    /// Las dos reglas son deliberadamente CORTAS y deterministas:
    ///   * el valor de una clave sensible (`token`, `password`, `secret`, `authorization`, `dek`)
    ///     se sustituye por `[REDACTED]`, sin mirar el tipo del valor;
    ///   * en el resto del texto, un `Bearer &lt;token&gt;` se reduce a `Bearer [REDACTED]`.
    ///
    /// Qué NO hace: no adivina patrones propios de la aplicación (un `query=?token=`), no busca
    /// entropía ni entiende de JWTs. Un scrubber heurístico que "adivina" es el que acaba comiéndose
    /// la traza que se necesitaba para depurar. Mismo criterio y mismos literales que el cliente.
    /// </summary>
    internal static class ClientLogRedactor
    {
        internal const string Redacted = "[REDACTED]";

        /// <summary>Fragmentos de clave que nunca guardan su valor, en minúsculas.</summary>
        private static readonly string[] SensitiveKeyFragments =
        [
            "token",
            "password",
            "secret",
            "authorization",
            "dek",
        ];

        private static readonly Regex BearerPattern = new(@"Bearer\s+\S+", RegexOptions.IgnoreCase);

        /// <summary>
        /// Texto libre listo para persistir: los `Bearer` quedan reducidos. Idempotente, para que
        /// volver a pasar por aquí no cambie nada.
        /// </summary>
        internal static string? RedactText(string? value)
            => value is null ? null : BearerPattern.Replace(value, $"Bearer {Redacted}");

        /// <summary>
        /// Contexto listo para serializar: las claves sensibles pierden el valor y los textos
        /// anidados pierden sus `Bearer`. Se reconstruye el diccionario en vez de mutarlo — el
        /// request es de quien lo manda.
        ///
        /// Un valor puede llegar como <see cref="JsonElement"/> porque el binding de
        /// <c>Dictionary&lt;string, object?&gt;</c> no materializa strings; por eso el walk distingue
        /// los dos mundos.
        /// </summary>
        internal static Dictionary<string, object?>? RedactContext(Dictionary<string, object?>? context)
        {
            if (context is null)
                return null;

            return context.ToDictionary(
                pair => pair.Key,
                pair => RedactValue(pair.Value, IsSensitiveKey(pair.Key)));
        }

        private static bool IsSensitiveKey(string key)
            => SensitiveKeyFragments.Any(fragment =>
                key.Contains(fragment, StringComparison.OrdinalIgnoreCase));

        private static object? RedactValue(object? value, bool sensitiveKey)
        {
            if (sensitiveKey)
                return Redacted;

            return value switch
            {
                null => null,
                string text => RedactText(text),
                JsonElement element => RedactElement(element),
                IDictionary<string, object?> map => RedactContext(
                    new Dictionary<string, object?>(map)),
                IEnumerable<object?> list => list.Select(item => RedactValue(item, false)).ToList(),
                _ => value,
            };
        }

        private static object? RedactElement(JsonElement element)
            => element.ValueKind switch
            {
                JsonValueKind.String => RedactText(element.GetString()),
                JsonValueKind.Object => element.EnumerateObject().ToDictionary(
                    property => property.Name,
                    property => RedactValue(property.Value, IsSensitiveKey(property.Name))),
                JsonValueKind.Array => element.EnumerateArray()
                    .Select(item => RedactValue(item, false))
                    .ToList(),
                _ => element,
            };
    }
}
