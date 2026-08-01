using Application.Abstractions.Roles;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.UserManagement.Users.Commands.AddUserRoles
{
    public class AddUserRolesCommandValidator : AbstractValidator<AddUserRolesCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IVisibleRoleService _visibleRoleService;
        private readonly IStringLocalizer<I18n> _localizer;

        public AddUserRolesCommandValidator(IUserRepository userRepository, IVisibleRoleService visibleRoleService, IStringLocalizer<I18n> localizer)
        {
            _userRepository = userRepository;
            _visibleRoleService = visibleRoleService;
            _localizer = localizer;

            RuleFor(x => x.UserId)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .MustAsync(UserExists).WithMessage(_localizer["UserNotFound", "{PropertyName}"]);

            RuleFor(x => x.RoleIds)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .MustAsync(AreVisibleRolesToCurrentUser).WithMessage(_localizer["RoleNotFound", "{PropertyName}"]);
        }

        private async Task<bool> UserExists(Guid userId, CancellationToken cancellationToken) 
            => await _userRepository.ExistsAsync(userId, cancellationToken);

        private async Task<bool> AreVisibleRolesToCurrentUser(IEnumerable<int> roleIds, CancellationToken cancellationToken)
        {
            return await _visibleRoleService.AreVisibleRolesToCurrentUserAsync(roleIds);
        }
    }
}
