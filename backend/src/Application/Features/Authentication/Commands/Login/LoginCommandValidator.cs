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
                .NotEmpty().WithMessage("'{PropertyName}' is required.")
                .MinimumLength(8).WithMessage("'{PropertyName}' must be at least 8 characters.")
                .Must(password => !string.IsNullOrEmpty(password) && password.Any(char.IsUpper)).WithMessage("'{PropertyName}' must contain at least one uppercase letter.");
        }
    }
}
