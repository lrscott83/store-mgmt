using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Common;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.DeliveryDrivers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver
{
    /// <summary>
    /// Edita un repartidor de la tienda del contexto: nombre, teléfono y el interruptor de activo
    /// (F7, vista "Repartidores").
    ///
    /// El interruptor va en el MISMO comando que la edición a propósito: es la acción que el dueño
    /// hace ("se fue", "vuelve"), no un endpoint aparte, y apagarlo es tan reversible como editar.
    ///
    /// Apagar `IsActive` es una BAJA LÓGICA, no un borrado: la fila sobrevive y conserva su `Id`,
    /// así que los pedidos que ya llevó mantienen su `DriverId` (criterio de aceptación 3). Por eso
    /// los repartidores dados de baja no aparecen en la lista por defecto pero siguen siendo
    /// consultables con `?activeOnly=true`.
    ///
    /// NO lleva `StoreId`: la tienda es la del contexto, y el handler exige que la fila cargada
    /// pertenezca a ella. Un repartidor de otra tienda es un 404 (criterio 2).
    /// </summary>
    public sealed class UpdateDeliveryDriverCommand : ICommand<DeliveryDriverDto>
    {
        /// <summary>Límite de la COLUMNA `Name`, compartido con el alta (<see cref="DeliveryDriverLimits"/>).</summary>
        public const int NameMaxLength = DeliveryDriverLimits.NameMaxLength;

        /// <summary>Límite de la COLUMNA `Phone`, compartido con el alta.</summary>
        public const int PhoneMaxLength = DeliveryDriverLimits.PhoneMaxLength;

        /// <summary>Repartidor a editar. Viene de la ruta; el handler lo carga y lo filtra por tienda.</summary>
        public Guid Id { get; set; }

        /// <summary>Nombre por el que la tienda lo conoce.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Teléfono de contacto: texto libre con prefijo internacional (D17).</summary>
        public string Phone { get; set; } = string.Empty;

        /// <summary>
        /// Interruptor de alta. `false` = baja lógica: deja de salir en las listas, no se borra.
        /// Los pedidos ya asignados NO se reasignan aquí (es una decisión de F5, y manual).
        ///
        /// NULABLE A PROPÓSITO (P0-3): `null` = el cuerpo OMITIÓ el campo, y omitir significa "no
        /// cambiar", no "apagar". Con un `bool` no nulable el binding convertía la omisión en
        /// `false` y el handler la escribía: un PATCH que solo corregía el nombre daba de baja al
        /// repartidor sin que nadie lo hubiera pedido. Mandar `true` o `false` sigue mandando.
        /// </summary>
        public bool? IsActive { get; set; }
    }

    public class UpdateDeliveryDriverCommandHandler : ICommandHandler<UpdateDeliveryDriverCommand, DeliveryDriverDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IDeliveryDriverRepository _deliveryDriverRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateDeliveryDriverCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IDeliveryDriverRepository deliveryDriverRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _deliveryDriverRepository = deliveryDriverRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<DeliveryDriverDto>> Handle(
            UpdateDeliveryDriverCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = StoreContextGuard.RequireStoreId(_httpContextService, _localizer);

            DeliveryDriver? driver = await _deliveryDriverRepository.GetByIdAsync(request.Id);

            // Mismo 404 para "no existe" y para "es de otra tienda": distinguirlos confirmaría la
            // existencia de un repartidor ajeno, que es justo lo que el aislamiento esconde.
            if (driver is null || driver.StoreId != storeId)
                throw new ApiException(_localizer["DeliveryDriverNotFound"], HttpStatusCode.NotFound);

            // La fila conserva SU `Id` (no se toca) y SU tienda/tenant: el cuerpo no puede
            // cambiarlos.
            driver.Name = request.Name.Trim();
            driver.Phone = request.Phone.Trim();

            // Omitir el interruptor NO lo apaga (P0-3): el cuerpo no lo pidió, así que la fila
            // conserva su estado. Solo un `true`/`false` explícito escribe el valor — y solo ese
            // valor entra en el conjunto de columnas a persistir.
            DeliveryDriverChangedField changedFields =
                DeliveryDriverChangedField.Name | DeliveryDriverChangedField.Phone;

            if (request.IsActive.HasValue)
            {
                driver.IsActive = request.IsActive.Value;
                changedFields |= DeliveryDriverChangedField.IsActive;
            }

            // Escritura PARCIAL: la fila entera NO viaja en el UPDATE. Con `EntityState.Modified` dos
            // PATCH concurrentes se pisarían, porque el último escribiría los valores que leyó antes.
            // El contexto es `NoTracking`, así que la fila cargada llega `Detached`, que es lo que
            // esta puerta exige.
            await _deliveryDriverRepository.UpdatePartialAsync(driver, changedFields, cancellationToken);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(driver.ToDto());
        }
    }
}
