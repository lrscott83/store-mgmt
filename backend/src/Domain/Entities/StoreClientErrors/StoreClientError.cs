using Domain.Common.Entities;
using Domain.Entities.Stores;

namespace Domain.Entities.StoreClientErrors
{
    /// <summary>
    /// Un error del cliente POS publicado al backend (spec S5 de `pos-client-error-logs`): el
    /// mensaje, la ruta, la ubicación, el contexto ya redactado y los datos del dispositivo.
    ///
    /// La tabla es APPEND-ONLY y no guarda PII: el contexto llega redactado desde el buffer
    /// `lizoft.client-log-v1` del navegador. `StoreId` es NULLABLE a propósito — un error anterior a
    /// una sesión (login fallido, clave de dispositivo) no tiene tienda (spec S4) — y el FK es
    /// Cascade para que el borrado de una tienda arrastre sus errores.
    ///
    /// No usa `AuditableEntity`: los dos tiempos que importan son `OccurredAt` (el `ts` del cliente
    /// en UTC) y `ReceivedAt` (la llegada al servidor, también UTC).
    /// </summary>
    public sealed class StoreClientError : Entity<Guid>
    {
        public const int MessageMaxLength = 500;
        public const int RouteMaxLength = 300;
        public const int LocationMaxLength = 500;
        public const int ContextMaxLength = 1000;
        public const int AppVersionMaxLength = 50;
        public const int DeviceMaxLength = 200;

        /// <summary>Tienda del error. null cuando el error ocurrió antes de existir una sesión.</summary>
        public Guid? StoreId { get; set; }

        public Store? Store { get; set; }

        /// <summary>Mensaje del error tal como lo produjo el cliente (nunca vacío).</summary>
        public string Message { get; set; } = string.Empty;

        /// <summary>Ruta de la aplicación donde ocurrió el error. Opcional.</summary>
        public string? Route { get; set; }

        /// <summary>Ubicación del código (fichero:línea o similar). Opcional.</summary>
        public string? Location { get; set; }

        /// <summary>
        /// Número de repeticiones de este error dentro de su ventana en el buffer del cliente. Nace
        /// en 1: una fila nunca representa cero ocurrencias.
        /// </summary>
        public int Count { get; set; } = 1;

        /// <summary>Contexto del cliente ya redactado y serializado como JSON. Opcional.</summary>
        public string? Context { get; set; }

        public string? AppVersion { get; set; }

        /// <summary>Identificación del dispositivo (modelo, plataforma o etiqueta del POS).</summary>
        public string? Device { get; set; }

        /// <summary>Momento del error según el cliente (`ts`), en UTC.</summary>
        public DateTime OccurredAt { get; set; }

        /// <summary>Momento de llegada al servidor, en UTC.</summary>
        public DateTime ReceivedAt { get; set; }

        private StoreClientError(Guid id, Guid? storeId, string message, string? route, string? location,
            int count, string? context, string? appVersion, string? device, DateTime occurredAt,
            DateTime receivedAt)
            : base(id)
        {
            StoreId = storeId;
            Message = message;
            Route = route;
            Location = location;
            Count = count;
            Context = context;
            AppVersion = appVersion;
            Device = device;
            OccurredAt = occurredAt;
            ReceivedAt = receivedAt;
        }

        /// <summary>Un error del cliente POS. `count` ya viene agregado por el buffer del navegador.</summary>
        public static StoreClientError Create(Guid? storeId, string message, string? route, string? location,
            int count, string? context, string? appVersion, string? device, DateTime occurredAt,
            DateTime receivedAt)
            => new(Guid.NewGuid(), storeId, message, route, location, count, context, appVersion, device,
                occurredAt, receivedAt);
    }
}
