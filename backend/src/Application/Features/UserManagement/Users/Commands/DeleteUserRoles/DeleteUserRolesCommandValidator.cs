using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.UserManagement.Users.Commands.DeleteUserRoles
{
    public class DeleteUserRolesCommandValidator : AbstractValidator<DeleteUserRolesCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public DeleteUserRolesCommandValidator(IUserRepository userRepository, IStringLocalizer<I18n> localizer)
        {
            _userRepository = userRepository;
            _localizer = localizer;

            RuleFor(x => x.UserId)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .MustAsync(UserExists).WithMessage(_localizer["UserNotFound", "{PropertyName}"]);

            RuleFor(x => x.RoleIds)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);
        }

        private async Task<bool> UserExists(Guid userId, CancellationToken cancellationToken)
            => await _userRepository.ExistsAsync(userId, cancellationToken);
    }
}
