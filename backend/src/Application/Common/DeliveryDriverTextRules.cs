using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Common
{
    /// <summary>
    /// Las reglas de FORMATO del nombre y el teléfono de un repartidor, en UN solo sitio, porque el
    /// alta y la edición tienen que decidir exactamente lo mismo sobre el mismo dato.
    ///
    /// Tres decisiones que no son obvias:
    ///
    ///   * <b>Se mide el valor RECORTADO</b>, que es el que se persiste (los handlers hacen
    ///     <c>Trim()</c> antes de guardar). Medir el valor crudo rechaza lo que sí cabe en la
    ///     columna —200 caracteres con espacios alrededor son 200 en la base— y, peor, deja pasar
    ///     lo que no cabe cuando los espacios van en medio.
    ///   * <b>Obligatoriedad sobre el valor recortado</b>: un campo de solo espacios no es un dato,
    ///     y es lo que un <c>NotEmpty</c> crudo dejaría entrar.
    ///   * <b>Caracteres de CONTROL rechazados</b> (salto de línea, tabulador, retorno de carro).
    ///     <c>Trim()</c> no los cubre: recorta los de los EXTREMOS, no los de dentro. Un nombre con
    ///     un salto de línea parte la fila de la lista y del selector de reparto de F5; un teléfono
    ///     con uno rompe el enlace `tel:` que el dueño marca desde el móvil.
    ///
    /// Los mensajes de obligatoriedad y de longitud se mantienen LOCALIZADOS con las mismas claves
    /// que antes (<c>IsRequired</c>, <c>DeliveryDriverNameTooLong</c>, <c>DeliveryDriverPhoneTooLong</c>):
    /// el texto visible no cambia. Los dos mensajes nuevos no tienen clave en el catálogo de
    /// recursos y se escriben literales, como ya hacen los validadores de autenticación.
    ///
    /// Lo que estas reglas NO deciden: la existencia del repartidor ni de la tienda (eso lo decide
    /// el handler contra la base de datos), la unicidad del nombre (no hay índice único por diseño:
    /// dos personas pueden llamarse igual) y ningún formato concreto de teléfono (D17).
    /// </summary>
    internal static class DeliveryDriverTextRules
    {
        private const string ControlCharactersMessage =
            "'{PropertyName}' must not contain line breaks, tabs or other control characters.";

        private const string PhoneCharactersMessage =
            "'{PropertyName}' may only contain digits, spaces and the characters + - ( ).";

        private const string PhoneDigitsMessage =
            "'{PropertyName}' must contain at least 6 digits.";

        /// <summary>Reglas del nombre: obligatorio, sin caracteres de control, dentro de la columna.</summary>
        internal static IRuleBuilderOptions<T, string> DeliveryDriverName<T>(
            this IRuleBuilder<T, string> rules, IStringLocalizer<I18n> localizer) =>
            rules
                .Must(HasText)
                .WithMessage(localizer["IsRequired", "{PropertyName}"])
                .Must(IsFreeOfControlCharacters)
                .WithMessage(ControlCharactersMessage)
                .Must(value => FitsWithin(value, DeliveryDriverLimits.NameMaxLength))
                .WithMessage(localizer["DeliveryDriverNameTooLong", "{PropertyName}", DeliveryDriverLimits.NameMaxLength]);

        /// <summary>
        /// Reglas del teléfono: obligatorio, sin caracteres de control, solo caracteres de teléfono,
        /// al menos <see cref="DeliveryDriverLimits.PhoneMinDigits"/> dígitos y dentro de la columna.
        /// </summary>
        internal static IRuleBuilderOptions<T, string> DeliveryDriverPhone<T>(
            this IRuleBuilder<T, string> rules, IStringLocalizer<I18n> localizer) =>
            rules
                .Must(HasText)
                .WithMessage(localizer["IsRequired", "{PropertyName}"])
                .Must(IsFreeOfControlCharacters)
                .WithMessage(ControlCharactersMessage)
                .Must(HasOnlyPhoneCharacters)
                .WithMessage(PhoneCharactersMessage)
                .Must(HasEnoughDigits)
                .WithMessage(PhoneDigitsMessage)
                .Must(value => FitsWithin(value, DeliveryDriverLimits.PhoneMaxLength))
                .WithMessage(localizer["DeliveryDriverPhoneTooLong", "{PropertyName}", DeliveryDriverLimits.PhoneMaxLength]);

        // `string?` a propósito: las reglas se evalúan también sobre un valor nulo, y ahí la que
        // manda es la de obligatoriedad — las demás tienen que dejarlo pasar sin reventar.

        private static bool HasText(string? value) => !string.IsNullOrWhiteSpace(value);

        private static bool IsFreeOfControlCharacters(string? value)
            => value is null || !value.Any(char.IsControl);

        private static bool FitsWithin(string? value, int maxLength)
            => value is null || value.Trim().Length <= maxLength;

        /// <summary>
        /// Dígitos, espacio y los separadores que la gente escribe en un teléfono. La barra y la
        /// almohadilla quedan fuera: no forman parte de un número marcable.
        /// </summary>
        private static bool HasOnlyPhoneCharacters(string? value)
            => value is null || value.All(c => char.IsDigit(c) || c is ' ' or '+' or '-' or '(' or ')');

        private static bool HasEnoughDigits(string? value)
            => value is null || value.Count(char.IsDigit) >= DeliveryDriverLimits.PhoneMinDigits;
    }
}
