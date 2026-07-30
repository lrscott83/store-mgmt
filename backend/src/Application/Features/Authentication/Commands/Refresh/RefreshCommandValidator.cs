using FluentValidation;

namespace Application.Features.Authentication.Commands.Refresh;

public sealed class RefreshCommandValidator : AbstractValidator<RefreshCommand>
{
    public RefreshCommandValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotNull().WithMessage("Refresh token is required.")
            .NotEmpty().WithMessage("Refresh token is required.");
    }
}
