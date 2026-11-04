using Application.Common;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver
{
    /// <summary>
    /// ¿Se puede dar de alta este repartidor? Solo reglas de FORMATO, y todas importan:
    ///
    ///   * Nombre y teléfono NO pueden faltar ni ser solo espacios. Un repartidor sin nombre no se
    ///     puede distinguir de otro en la lista, y sin teléfono no hay a quién llamar cuando
    ///     `GetOnlineOrdersQuery` (F5) filtra por él.
    ///   * Los límites de longitud son los de las COLUMNAS
    ///     (`DeliveryDriverEntityTypeConfiguration`): convertirlos aquí en un 400 con mensaje evita
    ///     un 500 en el INSERT. Se miden sobre el valor RECORTADO, que es el que se persiste.
    ///   * Sin caracteres de CONTROL: un salto de línea en el nombre parte la fila de la lista.
    ///
    /// Las reglas viven en <see cref="DeliveryDriverTextRules"/>, compartidas con el validador de la
    /// edición: si el alta y la edición midieran distinto, el PATCH aceptaría lo que el POST rechaza.
    ///
    /// Lo que este validador NO decide:
    ///
    ///   * Un FORMATO concreto de teléfono. Es texto para marcar en un móvil (D17), no un teléfono
    ///     normalizable: `+53 5 123 4567` es tan válido como `5351234567`, y normalizarlo aquí
    ///     rechazaría números que la gente escribe todos los días. Lo único que se exige es que sea
    ///     un teléfono: caracteres de teléfono y al menos 6 dígitos.
    ///   * Que el repartidor exista o sea de esta tienda: eso lo decide el handler contra la base
    ///     de datos, con el id y la tienda del contexto.
    ///   * Que el nombre sea ÚNICO. `DeliveryDriver` no lleva índice único por diseño — dos personas
    ///     pueden llamarse igual, y bloquear un alta por un texto sería impedir algo legítimo.
    ///
    /// Los mensajes de longitud usan claves PROPIAS (`DeliveryDriverNameTooLong` /
    /// `DeliveryDriverPhoneTooLong`, con el mismo formato posicional
    /// "{0} no puede superar los {1} caracteres" que las de cliente). Al principio prestaban las
    /// claves `OnlineOrderCustomer*` de F4: el texto visible era correcto porque los valores son
    /// posicionales, pero el nombre de la clave mentía sobre a quién aplicaba.
    /// </summary>
    public class CreateDeliveryDriverCommandValidator : AbstractValidator<CreateDeliveryDriverCommand>
    {
        public CreateDeliveryDriverCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.Name).DeliveryDriverName(localizer);

            RuleFor(x => x.Phone).DeliveryDriverPhone(localizer);
        }
    }
}
