using Application.Features.UserManagement.Users.Commands.UpdateUserPassword;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.UserManagement.Users.Commands.UpdateUserPassword
{
    public class UpdateUserPasswordCommandValidator : AbstractValidator<UpdateUserPasswordCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateUserPasswordCommandValidator(IStringLocalizer<I18n> localizer, IUserRepository userRepository)
        {
            _userRepository = userRepository;
            _localizer = localizer;

            RuleFor(x => x.UserId)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(UserExists).WithMessage(_localizer["UserNotFound", "{PropertyName}"]);

            RuleFor(x => x.OldPassword)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.NewPassword)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MinimumLength(8).WithMessage(_localizer["PasswordMinLength", "{PropertyName}", 8])
              .Must(password => !string.IsNullOrEmpty(password) && password.Any(char.IsUpper)).WithMessage(_localizer["PasswordRequiresUppercase", "{PropertyName}"]);

        }

        private async Task<bool> UserExists(Guid userId, CancellationToken cancellationToken)
        {
            return await _userRepository.ExistsAsync(userId, cancellationToken);
        }
    }
}
