using FluentValidation;

namespace Application.Features.Authentication.Commands.Login
{
    public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
    {

        public LoginCommandValidator()
        {
            RuleFor(x => x.Login)
                .NotNull().WithMessage("'{PropertyName}' is required.")
                .NotEmpty().WithMessage("'{PropertyName}' is required.")
                .MaximumLength(100).WithMessage("'{PropertyName}' must not exceed 100 characters.")
                .Matches(@"^[^@\s]+@[^@\s]+\.[^@\s]+$").WithMessage("'{PropertyName}' must be a valid email address.");

            RuleFor(x => x.Password)
                .NotNull().WithMessage("'{PropertyName}' is required.")
                .NotEmpty().WithMessage("'{PropertyName}' is required.")
                .MinimumLength(8).WithMessage("'{PropertyName}' must be at least 8 characters.")
                .MaximumLength(128).WithMessage("'{PropertyName}' must not exceed 128 characters.");
        }
    }
}
