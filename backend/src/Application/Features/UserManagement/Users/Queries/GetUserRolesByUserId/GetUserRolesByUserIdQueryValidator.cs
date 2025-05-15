using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.UserManagement.Users.Queries.GetUserRolesByUserId
{
    public class GetUserRolesByUserIdQueryValidator : AbstractValidator<GetUserRolesByUserIdQuery>
    {
        private readonly IUserRepository _userRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public GetUserRolesByUserIdQueryValidator(IStringLocalizer<I18n> localizer, IUserRepository userRepository)
        {
            _userRepository = userRepository;
            _localizer = localizer;

            RuleFor(x => x.UserId)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(UserExists).WithMessage(_localizer["UserNotFound", "{PropertyName}"]);

        }

        private async Task<bool> UserExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _userRepository.GetByIdAsync(tenantId) != null;
        }
    }
}
