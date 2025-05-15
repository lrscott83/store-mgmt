using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.Features.Administration.ReSellers.Commands.CreateReSeller;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.ReSellers;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Administration.ReSellers.Commands.CreateReSeller
{
    public class CreateReSellerCommandValidator : AbstractValidator<CreateReSellerCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateReSellerCommandValidator(IStringLocalizer<I18n> localizer, IUserRepository userRepository)
        {
            _userRepository = userRepository;
            _localizer = localizer;

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

            RuleFor(x => x.Cellphone)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            When(x => !string.IsNullOrEmpty(x.Email), () =>
            {
                RuleFor(x => x.Email).EmailAddress().WithMessage(_localizer["EmailFormatInvalid", "{PropertyName}"]);
            });
        }

        private async Task<bool> IsUniqueName(string login, CancellationToken cancellationToken)
        {
            return await _userRepository.IsUniqueLoginAsync(login);
        }

    }
}
