using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.UpsertStoreCatalogSettings
{
    /// <summary>
    /// ¿Se puede GUARDAR esta configuración? Dos reglas con una razón de negocio detrás:
    ///
    ///   1. `Enabled` SIN número de WhatsApp → rechazado. No importa la modalidad: TODOS los
    ///      pedidos salen por `wa.me`, así que sin número no hay a dónde enviar ni uno solo.
    ///      (Con el interruptor apagado el número puede faltar: la fila guarda el estado apagado.)
    ///   2. `Enabled` sin NINGUNA modalidad → rechazado. Un pedido abierto que no se puede recoger
    ///      ni enviar es un pedido que nadie puede hacer. Con al menos una abierta vale.
    ///
    /// No hay reglas de importe: el pedido online no tiene costo de envío ni importe mínimo
    /// (2026-10-08), así que el precio lo pone el catálogo y esta configuración ya no toca un solo
    /// número de dinero.
    ///
    /// Los límites de longitud son los de las columnas: convertirlos aquí en un 400 con mensaje
    /// evita un 500 en el INSERT.
    ///
    /// Lo que este validador NO decide: el formato del número (no es un teléfono validable, es
    /// texto para `wa.me` — D17), nada de la marca (F8) y nada del catálogo.
    /// </summary>
    public class UpsertStoreCatalogSettingsCommandValidator : AbstractValidator<UpsertStoreCatalogSettingsCommand>
    {
        public UpsertStoreCatalogSettingsCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.WhatsappNumber)
                .NotEmpty().WithMessage(localizer["OrderingWhatsappNumberRequired", "{PropertyName}"])
                .When(x => x.Enabled);

            RuleFor(x => x.WhatsappNumber)
                .MaximumLength(UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength)
                .WithMessage(localizer["OrderingWhatsappNumberTooLong", "{PropertyName}", UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength]);

            // Con el interruptor encendido tiene que quedar AL MENOS una modalidad abierta: un pedido que no
            // se puede recoger ni enviar no lo puede hacer nadie. La regla cuelga del objeto entero
            // porque la condición mezcla las dos modalidades, y `OverridePropertyName` hace que el
            // mensaje hable de las dos y no de una sola.
            RuleFor(x => x)
                .Must(x => x.PickupEnabled || x.DeliveryEnabled)
                .WithMessage(localizer["OrderingNoDeliveryTypeEnabled", "{PropertyName}"])
                .OverridePropertyName($"{nameof(UpsertStoreCatalogSettingsCommand.PickupEnabled)}/{nameof(UpsertStoreCatalogSettingsCommand.DeliveryEnabled)}")
                .When(x => x.Enabled);

            RuleFor(x => x.BusinessHours)
                .MaximumLength(UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength)
                .WithMessage(localizer["OrderingBusinessHoursTooLong", "{PropertyName}", UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength]);

            RuleFor(x => x.DeliveryZones)
                .MaximumLength(UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength)
                .WithMessage(localizer["OrderingDeliveryZonesTooLong", "{PropertyName}", UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength]);
        }
    }
}