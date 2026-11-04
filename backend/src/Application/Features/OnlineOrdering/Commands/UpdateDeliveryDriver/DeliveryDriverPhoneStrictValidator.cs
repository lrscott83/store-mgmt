using Application.Common;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver
{
    /// <summary>
    /// Las reglas ESTRICTAS del teléfono, ejecutables FUERA del pipeline de validación (R1-2).
    ///
    /// Existe porque el validador de la edición no puede decidir sobre el teléfono: ve el cuerpo,
    /// no la fila guardada, y corre en cada petición. Con las reglas estrictas dentro del validador,
    /// un repartidor heredado —teléfono con letras, con `#` o `/`, o con menos de seis dígitos— no
    /// se podía editar NI para cambiar solo el nombre: el 400 saltaba por un campo que el cliente no
    /// había tocado.
    ///
    /// El reparto queda así:
    ///
    ///   * El VALIDADOR de la edición usa las reglas permisivas (obligatorio, sin caracteres de
    ///     control, dentro de la columna): el cuerpo tiene que ser un texto utilizable, nada más.
    ///   * El HANDLER, ya con la fila cargada, compara el teléfono entrante con el guardado. Si
    ///     CAMBIA, corre este validador y lanza el mismo `400` con los mismos mensajes que antes
    ///     lanzaba el validador. Si no cambia, el valor heredado viaja intacto y no se escribe.
    ///
    /// Se valida sobre <see cref="UpdateDeliveryDriverCommand"/> —y no sobre el `string` suelto—
    /// para que el nombre de propiedad de los fallos siga siendo `Phone`, que es lo que el cliente
    /// recibe hoy en `errors[].code`. Ese detalle es la razón de reutilizar FluentValidation en vez
    /// de armar los mensajes a mano: los textos llevan el marcador `{PropertyName}`, que solo el
    /// motor sustituye.
    /// </summary>
    internal sealed class DeliveryDriverPhoneStrictValidator : AbstractValidator<UpdateDeliveryDriverCommand>
    {
        public DeliveryDriverPhoneStrictValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.Phone).DeliveryDriverPhone(localizer);
        }
    }
}
