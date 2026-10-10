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
    /// evita un 500 en el INSERT. Se miden sobre el valor **recortado**, que es lo que se persiste
    /// (`UpsertStoreCatalogSettingsCommandHandler.Trim`): medir el crudo rechazaba por 400 un texto
    /// que en la columna cabe de sobra (F1-R3).
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
                .Must(x => FitsAfterTrim(x, UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength))
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
                .Must(x => FitsAfterTrim(x, UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength))
                .WithMessage(localizer["OrderingBusinessHoursTooLong", "{PropertyName}", UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength]);

            RuleFor(x => x.DeliveryZones)
                .Must(x => FitsAfterTrim(x, UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength))
                .WithMessage(localizer["OrderingDeliveryZonesTooLong", "{PropertyName}", UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength]);
        }

        /// <summary>
        /// ¿Cabe el valor en la COLUMNA una vez recortado?
        ///
        /// Se mide el valor RECORTADO porque eso es lo que se persiste: el handler aplica su
        /// <c>Trim</c> (y guarda <c>null</c> si no queda nada) ANTES de escribir. Con
        /// <c>MaximumLength</c> sobre el valor crudo, un texto que ocupa <c>512 + N</c> caracteres
        /// pero cuyo contenido recortado ocupa 512 —un horario con espacios al final, un número
        /// pegado con un salto de línea— se rechazaba con un 400 que no era verdad: en la columna
        /// sí cabía. El cliente ve un rechazo y el servidor nunca llega a escribir.
        ///
        /// Por eso NO es <c>MaximumLength</c>: esa regla mide lo que le llega, no lo que se guarda.
        /// El `null` se trata como cadena vacía y pasa, igual que antes (un campo ausente no es un
        /// campo largo); el que decide si falta el número es <c>NotEmpty</c>, no esta regla.
        /// </summary>
        private static bool FitsAfterTrim(string? value, int maxLength)
            => (value ?? string.Empty).Trim().Length <= maxLength;
    }
}
