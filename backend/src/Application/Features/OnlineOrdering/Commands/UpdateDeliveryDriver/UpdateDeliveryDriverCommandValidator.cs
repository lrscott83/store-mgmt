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
    ///   * Nombre y teléfono: obligatorios, sin caracteres de control y dentro de los límites de sus
    ///     columnas medidos sobre el valor recortado.
    ///   * El teléfono usa las reglas PERMISIVAS a propósito (R1-2). Este validador corre en CADA
    ///     petición, incluidas las que solo cambian el nombre: exigir aquí el formato marcable y el
    ///     mínimo de dígitos rechazaba una fila heredada —letras, `#`, `/`, menos de seis dígitos—
    ///     por un campo que el cliente NO había tocado. Las reglas estrictas siguen mandando cuando
    ///     el teléfono cambia de verdad, y las aplica el handler
    ///     (`DeliveryDriverPhoneStrictValidator`) con el MISMO 400 y los MISMOS mensajes.
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

            RuleFor(x => x.Phone).DeliveryDriverPhonePermissive(localizer);
        }
    }
}
