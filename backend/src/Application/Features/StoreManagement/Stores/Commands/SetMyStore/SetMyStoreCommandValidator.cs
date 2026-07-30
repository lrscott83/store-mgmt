using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.SetMyStore
{
    public class SetMyStoreCommandValidator : AbstractValidator<SetMyStoreCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IStoreRepository _storeRepository;
        public SetMyStoreCommandValidator(IStringLocalizer<I18n> localizer, IStoreRepository storeRepository)
        {
            _localizer = localizer;
            _storeRepository = storeRepository;

            RuleFor(x => x.StoreId)
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(StoreExists).WithMessage(_localizer["StoreNotFound", "{PropertyName}"]);

        }
        private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
            => await _storeRepository.ExistsAsync(storeId);
    }
}
