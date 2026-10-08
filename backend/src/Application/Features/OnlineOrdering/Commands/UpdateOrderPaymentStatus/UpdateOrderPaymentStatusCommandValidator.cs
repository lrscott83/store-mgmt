using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.UpdateOrderPaymentStatus
{
    /// <summary>
    /// Una sola regla: que el pago pedido sea un valor REAL de
    /// <see cref="Domain.Common.Enums.OrderPaymentStatus"/> (`Pending` o `Paid`).
    ///
    /// Es una regla de ENTRADA, no de negocio: sin ella un entero crudo (7) se escribiría tal cual
    /// en la columna y el listado lo devolvería como un estado de pago que el panel no sabe pintar.
    /// No hay una máquina de estados que lo rechace después —el pago no la tiene— así que esta es la
    /// ÚNICA puerta, y por eso vive aquí en lugar de en el handler.
    ///
    /// Este validador NO exige que el pedido esté entregado o pagado en otra parte: el pago es
    /// manual y se marca en el momento que el dueño dice (D3).
    /// </summary>
    public class UpdateOrderPaymentStatusCommandValidator : AbstractValidator<UpdateOrderPaymentStatusCommand>
    {
        /// <summary>
        /// Mensaje literal, no por `IStringLocalizer`: la clave equivalente en
        /// `Resources/Localization/*.resx` no existe y añadirla es un cambio de Resources, fuera de
        /// la superficie de esta unidad.
        /// </summary>
        private const string PaymentStatusNotDefinedMessage = "'PaymentStatus' is not a valid payment status.";

        public UpdateOrderPaymentStatusCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.PaymentStatus)
                .IsInEnum()
                .WithMessage(PaymentStatusNotDefinedMessage);
        }
    }
}