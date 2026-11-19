using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreClientErrors;
using Application.ResponseModels;
using Application.UnitOfWorks;
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
    /// mensaje en blanco o un contexto que no se puede serializar no devuelven error al cliente,
    /// porque el POS nunca debe romperse por su propia telemetría.
    ///
    /// El tope de 50 entradas por petición es lo que evita que un buffer de 200 errores se convierta
    /// en una escritura arbitrariamente grande; lo que sobra se descarta (el POS ya reenvía en
    /// tandas y su buffer tiene 200 entradas como máximo).
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

        public RecordClientErrorsCommandHandler(
            IStoreClientErrorRepository storeClientErrorRepository,
            IApplicationUnitOfWork applicationUnitOfWork)
        {
            _storeClientErrorRepository = storeClientErrorRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
        }

        public async Task<ResponseResult<bool>> Handle(RecordClientErrorsCommand request,
            CancellationToken cancellationToken)
        {
            if (request.Errors is null || request.Errors.Count == 0)
                return ResponseResult.Success(false);

            DateTime receivedAt = DateTime.UtcNow;
            var errors = new List<StoreClientError>();

            foreach (ClientErrorEntryRequest item in request.Errors
                         .Take(MaxErrorsPerRequest)
                         .Where(item => item is not null))
            {
                string? message = Truncate(item.Message, StoreClientError.MessageMaxLength);
                if (string.IsNullOrWhiteSpace(message))
                    continue;

                errors.Add(StoreClientError.Create(
                    request.StoreId,
                    message!,
                    Truncate(item.Route, StoreClientError.RouteMaxLength),
                    Truncate(item.Location, StoreClientError.LocationMaxLength),
                    NormalizeCount(item.Count),
                    SerializeContext(item.Context),
                    Truncate(item.AppVersion, StoreClientError.AppVersionMaxLength),
                    Truncate(item.Device, StoreClientError.DeviceMaxLength),
                    DateTime.SpecifyKind(item.OccurredAt, DateTimeKind.Utc),
                    receivedAt));
            }

            if (errors.Count == 0)
                return ResponseResult.Success(false);

            await _storeClientErrorRepository.AddRangeAsync(errors);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            return ResponseResult.Success(true);
        }

        /// <summary>Una fila nunca representa cero ocurrencias: el cliente puede omitir el campo.</summary>
        private static int NormalizeCount(int? count)
            => count is > 0 ? count.Value : 1;

        /// <summary>El contexto llega redactado; solo se serializa y se acota a la columna.</summary>
        private static string? SerializeContext(Dictionary<string, object?>? context)
        {
            if (context is null || context.Count == 0)
                return null;

            string json = JsonSerializer.Serialize(context);
            return Truncate(json, StoreClientError.ContextMaxLength);
        }

        private static string? Truncate(string? value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            string trimmed = value.Trim();
            return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
        }
    }
}
