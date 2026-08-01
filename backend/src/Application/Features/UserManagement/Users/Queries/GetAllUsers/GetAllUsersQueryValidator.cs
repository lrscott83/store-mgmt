using FluentValidation;

namespace Application.Features.UserManagement.Users.Queries.GetAllUsers
{
    public sealed class GetAllUsersQueryValidator : AbstractValidator<GetAllUsersQuery>
    {
        public GetAllUsersQueryValidator()
        {
            // RuleFor(x => x.IncludeInactive).NotEmpty();
            // Validator is empty by design — IncludeInactive is bool (non-nullable value type).
            // File exists to establish the validator convention for future expansion.
        }
    }
}
