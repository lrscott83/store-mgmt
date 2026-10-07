using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.UpdateOrderStatus
{
    /// <summary>
    /// Una sola regla: que el estado pedido sea un valor REAL de <see cref="Domain.Common.Enums.OrderStatus"/>.
    ///
    /// Es una regla de ENTRADA, no de negocio: sin ella, un entero crudo (42) llegaría a
    /// `Order.ChangeStatus` y saldría como un 400 con el mensaje de transición —"from New to 42"—,
    /// que dice "la transición no existe" cuando lo que pasó es que el cliente mandó un estado que
    /// no existe. Son dos errores distintos y el cliente los distingue por el mensaje.
    ///
    /// Lo que este validador NO hace es decidir si la transición es alcanzable: eso depende del
    /// estado ACTUAL del pedido, que solo el handler sabe al leerlo. Rechazar `Cancelled` aquí
    /// dejaría al dueño sin poder cancelar un pedido desde cualquier estado.
    /// </summary>
    public class UpdateOrderStatusCommandValidator : AbstractValidator<UpdateOrderStatusCommand>
    {
        /// <summary>
        /// Mensaje literal, no por `IStringLocalizer`: la clave equivalente en
        /// `Resources/Localization/*.resx` no existe y añadirla es un cambio de Resources, fuera de
        /// la superficie de esta unidad. Un texto en inglés claro es mejor que una clave sin
        /// traducir que el cliente recibiría tal cual.
        /// </summary>
        private const string StatusNotDefinedMessage = "'Status' is not a valid order status.";

        public UpdateOrderStatusCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.Status)
                .IsInEnum()
                .WithMessage(StatusNotDefinedMessage);
        }
    }
}