using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.UserManagement.Users.Commands.UpdateUser
{
    public class UpdateUserCommandValidator : AbstractValidator<UpdateUserCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateUserCommandValidator(IStringLocalizer<I18n> localizer, IUserRepository userRepository)
        {
            _userRepository = userRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(UserExists).WithMessage(_localizer["UserNotFound", "{PropertyName}"]);

            RuleFor(x => x.FullName)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            When(x => !string.IsNullOrEmpty(x.Email), () =>
            {
                RuleFor(x => x.Email).EmailAddress().WithMessage(_localizer["EmailFormatInvalid", "{PropertyName}"]);
            });

        }

        private async Task<bool> UserExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _userRepository.GetByIdAsync(tenantId) != null;
        }
    }

}