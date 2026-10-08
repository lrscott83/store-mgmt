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

namespace Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver
{
    /// <summary>
    /// Da de alta un repartidor de la tienda del contexto (F7, vista "Repartidores"). Un catálogo de
    /// personas: el repartidor nace activo y NO lleva ningún pedido asociado.
    ///
    /// NO lleva `StoreId`: la tienda es la del contexto. Aceptarlo en el cuerpo dejaría que un
    /// dueño creara repartidores en la tienda de otro.
    ///
    /// Lo que este comando NO hace: asignarlo a un pedido. Eso es un acto sobre un pedido y
    /// pertenece a F5 (`AssignOrderDriverCommand`), que es quien valida que el repartidor sea de
    /// la tienda y esté activo.
    /// </summary>
    public sealed class CreateDeliveryDriverCommand : ICommand<DeliveryDriverDto>
    {
        /// <summary>
        /// Límite de la COLUMNA `Name` (<c>DeliveryDriverEntityTypeConfiguration</c>), no una
        /// decisión estética: un valor más largo revienta el INSERT con un 500. Aquí se convierte
        /// en un 400 con mensaje (ver el validador).
        /// </summary>
        public const int NameMaxLength = 200;

        /// <summary>Límite de la COLUMNA `Phone`; 32 como <c>Order.CustomerPhone</c>.</summary>
        public const int PhoneMaxLength = 32;

        /// <summary>Nombre por el que la tienda lo conoce.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Teléfono de contacto. Texto libre con prefijo internacional (D17): se marca en un móvil,
        /// no se parsea, así que no se exige un formato concreto.
        /// </summary>
        public string Phone { get; set; } = string.Empty;

        /// <summary>
        /// NO se acepta desde el cuerpo: un repartidor recién dado de alta está activo por
        /// definición. Volverlo a apagar es una EDICIÓN, no un alta.
        /// </summary>
        // (ninguna propiedad IsActive aquí a propósito)
    }

    public class CreateDeliveryDriverCommandHandler : ICommandHandler<CreateDeliveryDriverCommand, DeliveryDriverDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IDeliveryDriverRepository _deliveryDriverRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public CreateDeliveryDriverCommandHandler(
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
            CreateDeliveryDriverCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // Tienda y tenant salen del CONTEXTO, nunca del cuerpo (ver la nota del comando).
            DeliveryDriver driver = DeliveryDriver.Create(
                storeId,
                request.Name.Trim(),
                request.Phone.Trim(),
                _httpContextService.TenantId.ToGuid());

            // `.Add` marca la entidad explícitamente, así que no depende del estado de tracking.
            await _deliveryDriverRepository.AddAsync(driver);
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
