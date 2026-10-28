namespace Application.Common.Telemetry
{
    /// <summary>
    /// Clave ÚNICA de la telemetría anónima: la usan tanto las páginas públicas del sitio como
    /// el catálogo de las tiendas. Vive en el código a propósito — decisión de producto: no se
    /// lee de configuración, ni del secreto de firma del JWT, ni de ningún salt de passwords.
    ///
    /// Qué garantiza: que dos despliegues distintos no produzcan las mismas huellas para la misma
    /// IP + User-Agent + día, y que un cambio de configuración de autenticación no mueva las
    /// métricas.
    ///
    /// Qué NO garantiza: que la huella sea irreversible. Con la clave en el repositorio, quien
    /// tenga el código y la tabla puede reproducir los hashes. Es una consecuencia asumida, no un
    /// descuido; si algún día se necesita resistencia a esa enumeración, esta constante es el
    /// único punto que hay que cambiar.
    /// </summary>
    internal static class TelemetryHashKey
    {
        internal const string Value = "gentle-telemetry-2026-10-26-v1";
    }
}
