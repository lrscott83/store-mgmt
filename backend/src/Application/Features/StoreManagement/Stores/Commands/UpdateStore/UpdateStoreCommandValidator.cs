using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStore
{
    public class UpdateStoreCommandValidator : AbstractValidator<UpdateStoreCommand>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IModuleRepository _moduleRepository;
        public UpdateStoreCommandValidator(IStringLocalizer<I18n> localizer, IGetStoreByIdService storeByIdService, IModuleRepository moduleRepository)
        {
            _storeByIdService = storeByIdService;
            _localizer = localizer;
            _moduleRepository = moduleRepository;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(StoreExists).WithMessage(_localizer["StoreNotFound", "{PropertyName}"]);

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.ModuleIds)
                .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .MustAsync(AvailableModuleIdsToStore).WithMessage(_localizer["ModuleNotAvailableToStore", "{PropertyName}"]);
        }

        private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
        {
            return await _storeByIdService.GetStoreByIdIncludingModulesAsync(storeId) != null;
        }

        private async Task<bool> AvailableModuleIdsToStore(List<int> moduleIds, CancellationToken cancellationToken)
        {
            IEnumerable<Module> availableModules = await _moduleRepository.GetAvailableModulesToStore();
            HashSet<int> availableModuleIds = availableModules.Select(f => f.Id).ToHashSet();
            return moduleIds.All(availableModuleIds.Contains);
        }

    }
}
