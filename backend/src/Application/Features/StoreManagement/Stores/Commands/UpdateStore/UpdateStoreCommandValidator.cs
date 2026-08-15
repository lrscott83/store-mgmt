using Domain.Entities.Modules;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStore
{
    public class UpdateStoreCommandValidator : AbstractValidator<UpdateStoreCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IModuleRepository _moduleRepository;
        private readonly IStoreRepository _storeRepository;
        public UpdateStoreCommandValidator(IStringLocalizer<I18n> localizer, IModuleRepository moduleRepository, IStoreRepository storeRepository)
        {
            _localizer = localizer;
            _moduleRepository = moduleRepository;
            _storeRepository = storeRepository;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(StoreExists).WithMessage(_localizer["StoreNotFound", "{PropertyName}"]);

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            // ModuleIds is optional: a data-only update omits it (null) and the
            // plan is left untouched. When present it must be non-empty and
            // reference only modules available to store.
            RuleFor(x => x.ModuleIds)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .MustAsync((moduleIds, ct) => AvailableModuleIdsToStore(moduleIds!, ct))
                    .WithMessage(_localizer["ModuleNotAvailableToStore", "{PropertyName}"])
                .When(x => x.ModuleIds is not null);
        }

        private async Task<bool> AvailableModuleIdsToStore(List<int> moduleIds, CancellationToken cancellationToken)
        {
            IEnumerable<Module> availableModules = await _moduleRepository.GetAvailableModulesToStore();
            HashSet<int> availableModuleIds = availableModules.Select(f => f.Id).ToHashSet();
            return moduleIds.All(availableModuleIds.Contains);
        }

        private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
        {
            return await _storeRepository.ExistsAsync(storeId);
        }
    }
}
