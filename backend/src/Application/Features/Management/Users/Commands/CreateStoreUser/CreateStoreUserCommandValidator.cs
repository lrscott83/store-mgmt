using Application.Abstractions.Roles;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Management.Users.Commands.CreateStoreUser
{
    public class CreateStoreUserCommandValidator : AbstractValidator<CreateStoreUserCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IVisibleRoleService _visibleRoleService;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateStoreUserCommandValidator(IStringLocalizer<I18n> localizer, IUserRepository userRepository, 
            IVisibleRoleService visibleRoleService, IStoreRepository storeRepository)
        {
            _userRepository = userRepository;
            _visibleRoleService = visibleRoleService;
            _localizer = localizer;
            _storeRepository = storeRepository;

            RuleFor(x => x.StoreId)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(StoreExists).WithMessage(_localizer["StoreNotFound", "{PropertyName}"]);

            RuleFor(x => x.Login)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(IsUniqueName).WithMessage(_localizer["UserAlreadyExists", "{PropertyName}"]);

            RuleFor(x => x.Password)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.FullName)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            When(x => !string.IsNullOrEmpty(x.Email), () =>
            {
                RuleFor(x => x.Email).EmailAddress().WithMessage(_localizer["EmailFormatInvalid", "{PropertyName}"]);
            });

            RuleFor(x => x.RoleIds)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .MustAsync(AreRolesVisibles).WithMessage(_localizer["RoleNotFound", "{PropertyName}"]);
        }

        private async Task<bool> IsUniqueName(string login, CancellationToken cancellationToken)
        {
            return await _userRepository.IsUniqueLoginAsync(login);
        }

        private async Task<bool> AreRolesVisibles(IEnumerable<int> roleIds, CancellationToken cancellationToken)
        {
            return await _visibleRoleService.AreVisibleRolesToCurrentUserAsync(roleIds);
        }

        private async Task<bool> StoreExists(Guid ownerId, CancellationToken cancellationToken)
        {
            return await _storeRepository.GetByIdAsync(ownerId) != null;
        }

    }
}
