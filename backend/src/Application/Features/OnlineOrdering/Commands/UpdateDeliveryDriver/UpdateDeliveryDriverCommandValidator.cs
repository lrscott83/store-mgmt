using Application.Common;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver
{
    /// <summary>
    /// ¿Se puede guardar esta edición del repartidor? Gemelo del validador de alta, más el id:
    ///
    ///   * `Id` no puede venir vacío. Sin id no hay fila que actualizar, y el handler lo cargaría
    ///     para acabar en un 404 — más claro rechazarlo en el validador.
    ///   * Nombre y teléfono: las MISMAS reglas que el alta (<see cref="DeliveryDriverTextRules"/>):
    ///     obligatorios, sin caracteres de control, dentro de los límites de sus columnas medidos
    ///     sobre el valor recortado y, el teléfono, con al menos 6 dígitos.
    ///   * `IsActive` NO se valida: `false` es una baja legítima, no un dato inválido (criterio 3).
    ///
    /// Lo que NO valida: que el repartidor exista, sea de esta tienda o esté activo ya. Eso lo
    /// decide el handler contra la base de datos. En particular, la validación de "el repartidor
    /// asignado es de la tienda y está activo" NO es de F7: es de F5, que es quien asigna pedidos.
    ///
    /// Los mensajes de longitud usan claves PROPIAS (`DeliveryDriverNameTooLong` /
    /// `DeliveryDriverPhoneTooLong`). Antes prestaban las `OnlineOrderCustomer*` de F4: el texto
    /// visible era correcto porque los valores son posicionales, pero el nombre de la clave mentía
    /// sobre a quién aplicaba.
    /// </summary>
    public class UpdateDeliveryDriverCommandValidator : AbstractValidator<UpdateDeliveryDriverCommand>
    {
        public UpdateDeliveryDriverCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.Id)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Name).DeliveryDriverName(localizer);

            RuleFor(x => x.Phone).DeliveryDriverPhone(localizer);
        }
    }
}
