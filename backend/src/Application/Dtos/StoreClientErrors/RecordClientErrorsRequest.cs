namespace Application.Dtos.StoreClientErrors
{
    /// <summary>
    /// Cuerpo del alta de errores del cliente POS. El POS acumula en su buffer local
    /// (`lizoft.client-log-v1`) solo los `level: 'error'` y los envía en lote cuando el dispositivo
    /// está online. `StoreId` es NULLABLE a propósito: un error anterior a una sesión (login
    /// fallido, clave de dispositivo) se publica igual y su tienda no existe (spec S4).
    ///
    /// El contexto llega redactado por el cliente y el servidor lo VUELVE A REDACTAR
    /// (`ClientLogRedactor`): la redacción del navegador es una promesa del cliente, no una
    /// garantía del servidor.
    /// </summary>
    public sealed class RecordClientErrorsRequest
    {
        public Guid? StoreId { get; set; }

        public List<ClientErrorEntryRequest>? Errors { get; set; }
    }

    /// <summary>
    /// Un error del buffer del cliente. `OccurredAt` es el `ts` del cliente (ISO con offset o `Z`)
    /// y `Count` el número de repeticiones que el buffer ya agregó en su ventana.
    /// </summary>
    public sealed class ClientErrorEntryRequest
    {
        public DateTime OccurredAt { get; set; }

        public string Message { get; set; } = string.Empty;

        public string? Route { get; set; }

        public string? Location { get; set; }

        public int? Count { get; set; }

        public Dictionary<string, object?>? Context { get; set; }

        public string? AppVersion { get; set; }

        public string? Device { get; set; }
    }
}
