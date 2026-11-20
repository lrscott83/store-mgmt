using System.Text.Json;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Common.ClientLogRedaction;
using Application.Dtos.StoreClientErrors;
using Application.Features.StoreSync;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Stores;
using Domain.Entities.StoreClientErrors;
using Domain.Interfaces.Repositories;

namespace Application.Features.StoreClientErrors.Commands.RecordClientErrors
{
    /// <summary>
    /// Lote de errores del POS que el cliente acumuló en su buffer local mientras estaba offline
    /// (specs S1-S4). La tienda es opcional: un error anterior a una sesión no tiene tienda.
    /// </summary>
    public sealed record RecordClientErrorsCommand(Guid? StoreId,
        IReadOnlyCollection<ClientErrorEntryRequest> Errors) : ICommand<bool>;

    /// <summary>
    /// Alta de los errores del cliente POS. Es un endpoint de MEJOR ESFUERZO: un lote vacío, un
    /// mensaje en blanco, un contexto que no se puede serializar o una tienda que el llamador no
    /// puede tocar no devuelven error al cliente, porque el POS nunca debe romperse por su propia
    /// telemetría. El resultado sí lo cuenta: `true` = se guardó algo, `false` = no se guardó nada.
    ///
    /// EL TOPE de 50 entradas por petición se aplica DESPUÉS de descartar lo inútil: con el tope
    /// delante, un lote con diez entradas basura solo guardaría cuarenta errores reales. Lo que
    /// sobra por encima del tope se descarta (el POS ya reenvía en tandas y su buffer tiene 200
    /// entradas como máximo).
    ///
    /// LA TIENDA SE VERIFICA, no se cree. `StoreId` llega del cuerpo, y `[HasPermission]` no
    /// protege este endpoint (los errores anteriores a una sesión no tienen feature alguna): sin
    /// esta comprobación cualquier usuario autenticado podría atribuir filas a la tienda de otro.
    /// Se reutiliza el ámbito de tiendas que ya usan los endpoints de sincronización
    /// (<see cref="StoreSyncStoreScope"/>), que resuelve el MISMO conjunto que el listado canónico
    /// del usuario. Un `StoreId` null sigue siendo válido (spec S4) y no consulta nada.
    ///
    /// EL TEXTO SE VUELVE A REDACTAR en el servidor (<see cref="ClientLogRedactor"/>): la redacción
    /// que hace el cliente es una promesa del cliente, no una garantía del servidor.
    ///
    /// Los dos tiempos se guardan en UTC: `OccurredAt` llega del cliente y se fuerza a `Kind=Utc`
    /// porque Npgsql rechaza un `timestamp with time zone` con `Kind=Unspecified`/`Local`;
    /// `ReceivedAt` lo decide el servidor.
    /// </summary>
    public sealed class RecordClientErrorsCommandHandler
        : ICommandHandler<RecordClientErrorsCommand, bool>
    {
        private const int MaxErrorsPerRequest = 50;

        private readonly IStoreClientErrorRepository _storeClientErrorRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreRepository _storeRepository;

        public RecordClientErrorsCommandHandler(
            IStoreClientErrorRepository storeClientErrorRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreRepository storeRepository)
        {
            _storeClientErrorRepository = storeClientErrorRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
        }

        public async Task<ResponseResult<bool>> Handle(RecordClientErrorsCommand request,
            CancellationToken cancellationToken)
        {
            if (request.Errors is null || request.Errors.Count == 0)
                return ResponseResult.Success(false);

            Guid? storeId = await ResolveStoreIdAsync(request.StoreId, cancellationToken);

            // Tienda pedida y fuera del ámbito del llamador: no se guarda NADA. Nunca un 403 —el POS
            // es fire-and-forget— pero el descarte se ve en `Data`, que es lo que distingue "no
            // había nada que guardar" de "se rechazó la atribución".
            if (request.StoreId is not null && storeId is null)
                return ResponseResult.Success(false);

            DateTime receivedAt = DateTime.UtcNow;
            var errors = new List<StoreClientError>();

            foreach (ClientErrorEntryRequest? item in request.Errors)
            {
                // Se filtra ANTES de contar: el tope es de filas guardables, no de filas recibidas.
                if (errors.Count == MaxErrorsPerRequest)
                    break;

                if (item is null)
                    continue;

                if (!TryTruncateRequired(
                        ClientLogRedactor.RedactText(item.Message),
                        StoreClientError.MessageMaxLength,
                        out string message))
                    continue;

                errors.Add(StoreClientError.Create(new StoreClientError.NewStoreClientError(
                    storeId,
                    message,
                    TruncateOptional(ClientLogRedactor.RedactText(item.Route),
                        StoreClientError.RouteMaxLength),
                    TruncateOptional(ClientLogRedactor.RedactText(item.Location),
                        StoreClientError.LocationMaxLength),
                    NormalizeCount(item.Count),
                    SerializeContext(item.Context),
                    TruncateOptional(ClientLogRedactor.RedactText(item.AppVersion),
                        StoreClientError.AppVersionMaxLength),
                    TruncateOptional(ClientLogRedactor.RedactText(item.Device),
                        StoreClientError.DeviceMaxLength),
                    DateTime.SpecifyKind(item.OccurredAt, DateTimeKind.Utc),
                    receivedAt)));
            }

            if (errors.Count == 0)
                return ResponseResult.Success(false);

            await _storeClientErrorRepository.AddRangeAsync(errors);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            return ResponseResult.Success(true);
        }

        /// <summary>
        /// La tienda que el llamador puede usar, o `null` cuando la pedida queda fuera de su ámbito.
        /// `null` de entrada significa "sin tienda" y no consulta nada: el error es anterior a una
        /// sesión (spec S4) y no hay atribución que comprobar.
        /// </summary>
        private async Task<Guid?> ResolveStoreIdAsync(Guid? requestedStoreId,
            CancellationToken cancellationToken)
        {
            if (requestedStoreId is null)
                return null;

            Store? allowed = await StoreSyncStoreScope.TryResolveAsync(
                requestedStoreId.Value, _httpContextService, _storeRepository, cancellationToken);

            return allowed?.Id;
        }

        /// <summary>Una fila nunca representa cero ocurrencias: el cliente puede omitir el campo.</summary>
        private static int NormalizeCount(int? count)
            => count is > 0 ? count.Value : 1;

        /// <summary>
        /// El contexto se redacta Y se serializa DENTRO del mismo guard: la redacción también puede
        /// fallar (un <c>JsonElement</c> con claves repetidas, un valor que lanza al recorrerlo), y
        /// una redacción evaluada fuera del <c>try</c> dejaría escapar la excepción y se llevaría el
        /// lote entero, justo lo que este método promete que no pasa. Si algo falla, la fila se
        /// guarda SIN contexto en vez de perderse: es un endpoint de mejor esfuerzo.
        /// </summary>
        private static string? SerializeContext(Dictionary<string, object?>? context)
        {
            if (context is null || context.Count == 0)
                return null;

            try
            {
                Dictionary<string, object?>? redacted = ClientLogRedactor.RedactContext(context);

                return TruncateOptional(JsonSerializer.Serialize(redacted),
                    StoreClientError.ContextMaxLength);
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>
        /// Texto obligatorio ya normalizado. `false` cuando viene en blanco: esa entrada se descarta
        /// y el `out` no tiene que ser un `null` que el llamador tendría que silenciar con `!`.
        /// </summary>
        private static bool TryTruncateRequired(string? value, int maxLength, out string truncated)
        {
            string? normalized = Normalize(value, maxLength);
            truncated = normalized ?? string.Empty;
            return normalized is not null;
        }

        /// <summary>Texto opcional ya normalizado: `null` cuando viene en blanco.</summary>
        private static string? TruncateOptional(string? value, int maxLength)
            => Normalize(value, maxLength);

        private static string? Normalize(string? value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            string trimmed = value.Trim();
            return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
        }
    }
}
