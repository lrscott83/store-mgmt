using Domain.Interfaces.Services.Stores;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.ActivateStore
{
    public class ActivateStoreCommandValidator : AbstractValidator<ActivateStoreCommand>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStringLocalizer<I18n> _localizer;
        public ActivateStoreCommandValidator(IStringLocalizer<I18n> localizer, IGetStoreByIdService storeByIdService)
        {
            _storeByIdService = storeByIdService;
            _localizer = localizer;

            RuleFor(x => x.Id)
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
