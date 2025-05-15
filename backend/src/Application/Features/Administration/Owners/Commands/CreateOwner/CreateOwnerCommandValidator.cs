using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Administration.Owners.Commands.CreateOwner
{
    public class CreateOwnerCommandValidator : AbstractValidator<CreateOwnerCommand>
    {
        private readonly IUserRepository _userRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateOwnerCommandValidator(IStringLocalizer<I18n> localizer, IUserRepository userRepository, 
            IReSellerRepository reSellerRepository)
        {
            _userRepository = userRepository;
            _reSellerRepository = reSellerRepository;
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

            When(x => x.ReSellerId.HasValue, () =>
            {
                RuleFor(x => x.ReSellerId)
                    .MustAsync(ReSellerExists).WithMessage(_localizer["ReSellerNotFound", "{PropertyName}"]);
            });

            When(x => !string.IsNullOrEmpty(x.Email), () =>
            {
                RuleFor(x => x.Email).EmailAddress().WithMessage(_localizer["EmailFormatInvalid", "{PropertyName}"]);
            });
        }

        private async Task<bool> IsUniqueName(string login, CancellationToken cancellationToken)
        {
            return await _userRepository.IsUniqueLoginAsync(login);
        }

        private async Task<bool> ReSellerExists(Guid? reSellerId, CancellationToken cancellationToken)
        {
            return await _reSellerRepository.GetByIdAsync(reSellerId.Value) != null;
        }

    }
}
