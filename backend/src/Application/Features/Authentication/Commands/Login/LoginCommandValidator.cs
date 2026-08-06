using FluentValidation;

namespace Application.Features.Authentication.Commands.Login
{
    public sealed class LoginCommandValidator : AbstractValidator<LoginCommand>
    {

        public LoginCommandValidator()
        {
            // A login is a username, not an email address — the registration form
            // collects `login` and `email` as two separate fields. Presence is the
            // only rule, mirroring RegisterCommandValidator, which imposes no format
            // either. Anything stricter here than there locks users out of accounts
            // registration already created.
            RuleFor(x => x.Login)
                .NotNull().WithMessage("'{PropertyName}' is required.")
                .NotEmpty().WithMessage("'{PropertyName}' is required.");

            RuleFor(x => x.Password)
                .NotNull().WithMessage("'{PropertyName}' is required.")
                .NotEmpty().WithMessage("'{PropertyName}' is required.")
                .MinimumLength(8).WithMessage("'{PropertyName}' must be at least 8 characters.")
                .MaximumLength(128).WithMessage("'{PropertyName}' must not exceed 128 characters.");
        }
    }
}
