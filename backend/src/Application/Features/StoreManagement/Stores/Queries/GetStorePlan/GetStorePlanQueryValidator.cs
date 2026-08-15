using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Queries.GetStorePlan
{
    public class GetStorePlanQueryValidator : AbstractValidator<GetStorePlanQuery>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IStoreRepository _storeRepository;
        public GetStorePlanQueryValidator(IStringLocalizer<I18n> localizer, IStoreRepository storeRepository)
        {
            _localizer = localizer;
            _storeRepository = storeRepository;

            // Same gate as GetStoreByIdQueryValidator: unknown/empty ids are a
            // 400 with property code "Id", not a 404.
            RuleFor(x => x.Id)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(StoreExists).WithMessage(_localizer["StoreNotFound", "{PropertyName}"]);
        }
        private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
        {
            return await _storeRepository.ExistsAsync(storeId);
        }
    }
}
