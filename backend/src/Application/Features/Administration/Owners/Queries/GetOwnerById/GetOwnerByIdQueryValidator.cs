using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.Owners.Queries.GetOwnerById
{
    public class GetOwnerByIdQueryValidator : AbstractValidator<GetOwnerByIdQuery>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        public GetOwnerByIdQueryValidator(IStringLocalizer<I18n> localizer)
        {
            _localizer = localizer;

            RuleFor(x => x.OwnerId)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

        }
    }
}
