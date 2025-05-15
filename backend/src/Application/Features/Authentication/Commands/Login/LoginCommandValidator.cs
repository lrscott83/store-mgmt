using FluentValidation;

namespace Application.Features.Authentication.Commands.Login
{
    public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
    {

        public LoginCommandValidator()
        {
            RuleFor(x => x.Login)
                .NotNull().WithMessage("'{PropertyName}' is required.")
               .NotEmpty().WithMessage("'{PropertyName}' is required.");

            RuleFor(x => x.Password)
                .NotNull().WithMessage("'{PropertyName}' is required.")
                .NotEmpty().WithMessage("'{PropertyName}' is required.");
        }
    }
}
