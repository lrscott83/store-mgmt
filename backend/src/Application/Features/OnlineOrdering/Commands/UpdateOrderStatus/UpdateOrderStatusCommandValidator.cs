using Domain.Common.Enums;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.UpdateOrderStatus
{
    /// <summary>
    /// Reglas de ENTRADA: que el estado pedido exista y que los datos que cada transición exige
    /// vengan. No deciden si la transición es alcanzable — eso depende del estado ACTUAL del
    /// pedido, que solo el handler conoce al leerlo.
    ///
    /// Sin la primera regla, un entero crudo (42) llegaría a `Order.ChangeStatus` y saldría como un
    /// 400 con el mensaje de transición —"from Creado to 42"—, que dice "la transición no existe"
    /// cuando lo que pasó es que el cliente mandó un estado que no existe.
    ///
    /// Las dos reglas condicionales existen para que el error llegue antes de tocar la fila y con
    /// un mensaje que nombre el campo que falta, en vez del veredicto del dominio.
    /// </summary>
    public class UpdateOrderStatusCommandValidator : AbstractValidator<UpdateOrderStatusCommand>
    {
        /// <summary>
        /// Mensajes literales, no por `IStringLocalizer`: las claves equivalentes en
        /// `Resources/Localization/*.resx` no existen y añadirlas es un cambio de Resources, fuera
        /// de la superficie de esta unidad. Un texto en inglés claro es mejor que una clave sin
        /// traducir que el cliente recibiría tal cual.
        /// </summary>
        private const string StatusNotDefinedMessage = "'Status' is not a valid order status.";

        private const string CancellationReasonRequiredMessage =
            "'CancellationReason' is required when cancelling an order.";

        private const string DriverRequiredMessage =
            "'DriverId' is required when moving an order to 'Transportando'.";

        public UpdateOrderStatusCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.Status)
                .IsInEnum()
                .WithMessage(StatusNotDefinedMessage);

            RuleFor(x => x.CancellationReason)
                .NotEmpty()
                .When(x => x.Status == OrderStatus.Cancelado)
                .WithMessage(CancellationReasonRequiredMessage);

            RuleFor(x => x.DriverId)
                .NotNull()
                .When(x => x.Status == OrderStatus.Transportando)
                .WithMessage(DriverRequiredMessage);
        }
    }
}
