using FluentValidation;

namespace Application.Features.UserManagement.Users.Queries.GetUsersByStoreId
{
    public sealed class GetUsersByStoreIdQueryValidator : AbstractValidator<GetUsersByStoreIdQuery>
    {
        public GetUsersByStoreIdQueryValidator()
        {
            RuleFor(x => x.StoreId).NotEmpty();
            // IncludeInactive is bool (non-nullable value type) — nothing to validate.
        }
    }
}