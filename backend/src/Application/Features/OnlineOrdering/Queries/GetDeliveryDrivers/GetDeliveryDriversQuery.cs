using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Queries.GetDeliveryDrivers
{
    /// <summary>
    /// Repartidores de la tienda del contexto (F7, vista "Repartidores"). Un catálogo de personas:
    /// esta lectura no cuenta pedidos ni dice quién lleva cuál.
    ///
    /// <c>ActiveOnly</c> decide si los dados de baja entran. El valor por defecto es <c>false</c>
    /// —solo activos— porque es lo que necesita el selector de reparto de F5; la vista de
    /// gestión lo pone en <c>true</c> para poder volver a activarlos.
    ///
    /// Una tienda sin repartidores devuelve una lista VACÍA, no un 404: es el estado normal de una
    /// tienda que aún no ha dado de alta a nadie, y un error obligaría al frontend a modelarlo
    /// como fallo.
    /// </summary>
    public sealed record GetDeliveryDriversQuery(bool ActiveOnly = false) : IQuery<IEnumerable<DeliveryDriverDto>>;

    public class GetDeliveryDriversQueryHandler : IQueryHandler<GetDeliveryDriversQuery, IEnumerable<DeliveryDriverDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IDeliveryDriverRepository _deliveryDriverRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetDeliveryDriversQueryHandler(
            IHttpContextService httpContextService,
            IDeliveryDriverRepository deliveryDriverRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _deliveryDriverRepository = deliveryDriverRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<DeliveryDriverDto>>> Handle(
            GetDeliveryDriversQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // El filtro por tienda va EN LA CONSULTA, no en un `Where` de memoria: filtrar después
            // significaría haber leído ya las filas de otras tiendas. `ActiveOnly` se traduce a
            // `includeInactive` con la negación, que es como lo nombra el repositorio.
            IReadOnlyCollection<DeliveryDriver> drivers =
                await _deliveryDriverRepository.GetByStoreIdAsync(storeId, includeInactive: query.ActiveOnly);

            return ResponseResult.Success<IEnumerable<DeliveryDriverDto>>(drivers.Select(ToDto).ToList());
        }

        /// <summary>
        /// Mapeo explícito (no un spread) para que un campo nuevo de la entidad no aparezca en el
        /// DTO por accidente: `TenantId` no debe salir de aquí.
        /// </summary>
        private static DeliveryDriverDto ToDto(DeliveryDriver driver) => new()
        {
            Id = driver.Id,
            StoreId = driver.StoreId,
            Name = driver.Name,
            Phone = driver.Phone,
            IsActive = driver.IsActive,
        };
    }
}
