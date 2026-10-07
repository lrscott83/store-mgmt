using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.OnlineOrdering.Commands.CreateOnlineOrder
{
    /// <summary>
    /// Reglas de FORMATO del pedido online. Lo que NO cabe aquí es nada que dependa de la tienda
    /// (si admite la modalidad, el mínimo, el envío): eso lo comprueba el handler contra
    /// `StoreCatalogSettings`, porque esta tienda y la siguiente no tienen las mismas reglas.
    ///
    /// Nota: el `Code`, el total y la moneda no se validan aquí porque no vienen del cliente.
    /// </summary>
    public class CreateOnlineOrderCommandValidator : AbstractValidator<CreateOnlineOrderCommand>
    {
        public CreateOnlineOrderCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.CustomerName)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"])
                .MaximumLength(CreateOnlineOrderCommand.CustomerNameMaxLength)
                .WithMessage(localizer["OnlineOrderCustomerNameTooLong", "{PropertyName}", CreateOnlineOrderCommand.CustomerNameMaxLength]);

            RuleFor(x => x.CustomerPhone)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"])
                .MaximumLength(CreateOnlineOrderCommand.CustomerPhoneMaxLength)
                .WithMessage(localizer["OnlineOrderCustomerPhoneTooLong", "{PropertyName}", CreateOnlineOrderCommand.CustomerPhoneMaxLength]);

            RuleFor(x => x.DeliveryAddress)
                .MaximumLength(CreateOnlineOrderCommand.DeliveryAddressMaxLength)
                .WithMessage(localizer["OnlineOrderDeliveryAddressTooLong", "{PropertyName}", CreateOnlineOrderCommand.DeliveryAddressMaxLength])
                .When(x => !string.IsNullOrWhiteSpace(x.DeliveryAddress));

            RuleFor(x => x.Notes)
                .MaximumLength(CreateOnlineOrderCommand.NotesMaxLength)
                .WithMessage(localizer["OnlineOrderNotesTooLong", "{PropertyName}", CreateOnlineOrderCommand.NotesMaxLength])
                .When(x => !string.IsNullOrWhiteSpace(x.Notes));

            // El carrito no vacío y cada línea con id y cantidad positiva. El PRECIO de la línea NO
            // se valida aquí porque no existe en el payload: lo pone el catálogo.
            RuleFor(x => x.Items)
                .NotEmpty().WithMessage(localizer["OnlineOrderEmptyCart", "{PropertyName}"]);

            RuleForEach(x => x.Items).SetValidator(new CreateOnlineOrderLineRequestValidator(localizer));
        }
    }

    public class CreateOnlineOrderLineRequestValidator : AbstractValidator<CreateOnlineOrderLineRequest>
    {
        public CreateOnlineOrderLineRequestValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.ProductId)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Quantity)
                .GreaterThan(0).WithMessage(localizer["OnlineOrderQuantityInvalid", "{PropertyName}"]);
        }
    }
}