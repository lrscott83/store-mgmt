using FluentValidation;

namespace Application.Features.Authentication.Commands.Revoke;

public sealed class RevokeCommandValidator : AbstractValidator<RevokeCommand>
{
    public RevokeCommandValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty().WithMessage("Refresh token must not be empty when provided.")
            .When(x => x.RefreshToken is not null);
    }
}
