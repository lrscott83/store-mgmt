using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Management.Users.Commands.ActivateUser
{
    public class ActivateUserCommandValidator : AbstractValidator<ActivateUserCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public ActivateUserCommandValidator(IStringLocalizer<I18n> localizer, IUserRepository userRepository)
        {
            _userRepository = userRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
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
