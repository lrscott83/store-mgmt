using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.SetMyStore
{
    public class SetMyStoreCommandValidator : AbstractValidator<SetMyStoreCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IGetStoreByIdService _storeByIdService;
        public SetMyStoreCommandValidator(IStringLocalizer<I18n> localizer, IGetStoreByIdService storeByIdService)
        {
            _localizer = localizer;
            _storeByIdService = storeByIdService;

            RuleFor(x => x.StoreId)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(StoreExists).WithMessage(_localizer["StoreNotFound", "{PropertyName}"]);

        }
        private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
        {
            return await _storeByIdService.GetStoreByIdIncludingModulesAsync(storeId) != null;
        }
    }
}
