using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
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
        /// <summary>Límite de la COLUMNA `Name` (ver <c>DeliveryDriverEntityTypeConfiguration</c>).</summary>
        public const int NameMaxLength = 200;

        /// <summary>Límite de la COLUMNA `Phone`.</summary>
        public const int PhoneMaxLength = 32;

        /// <summary>Repartidor a editar. Viene de la ruta; el handler lo carga y lo filtra por tienda.</summary>
        public Guid Id { get; set; }

        /// <summary>Nombre por el que la tienda lo conoce.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Teléfono de contacto: texto libre con prefijo internacional (D17).</summary>
        public string Phone { get; set; } = string.Empty;

        /// <summary>
        /// Interruptor de alta. `false` = baja lógica: deja de salir en las listas, no se borra.
        /// Los pedidos ya asignados NO se reasignan aquí (es una decisión de F5, y manual).
        /// </summary>
        public bool IsActive { get; set; }
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
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            DeliveryDriver? driver = await _deliveryDriverRepository.GetByIdAsync(request.Id);

            // Mismo 404 para "no existe" y para "es de otra tienda": distinguirlos confirmaría la
            // existencia de un repartidor ajeno, que es justo lo que el aislamiento esconde.
            if (driver is null || driver.StoreId != storeId)
                throw new ApiException(_localizer["DeliveryDriverNotFound"], HttpStatusCode.NotFound);

            // La fila conserva SU `Id` (no se toca) y SU tienda/tenant: el cuerpo no puede
            // cambiarlos. `UpdateAsync` la marca explícitamente, que es lo que hace falta con un
            // contexto `NoTracking` — mutar y guardar sin marcar escribiría NADA, sin error.
            driver.Name = request.Name.Trim();
            driver.Phone = request.Phone.Trim();
            driver.IsActive = request.IsActive;

            await _deliveryDriverRepository.UpdateAsync(driver);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(ToDto(driver));
        }

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
