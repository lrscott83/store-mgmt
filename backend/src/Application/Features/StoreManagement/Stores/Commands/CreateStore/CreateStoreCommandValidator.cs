using Application.Abstractions.HttpContext;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.CreateStore
{
    public class CreateStoreCommandValidator : AbstractValidator<CreateStoreCommand>
    {
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IModuleRepository _moduleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateStoreCommandValidator(IStringLocalizer<I18n> localizer, IOwnerRepository ownerRepository, 
            IStoreRepository storeRepository, IModuleRepository moduleRepository, IHttpContextService httpContextService)
        {
            _ownerRepository = ownerRepository;
            _storeRepository = storeRepository;
            _moduleRepository = moduleRepository;
            _httpContextService = httpContextService;
            _localizer = localizer;

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(IsUniqueName).WithMessage(_localizer["UserAlreadyExists", "{PropertyName}"]);

            // Owner branch (user-approved StoreCreation): OwnerId and ModuleIds are both
            // DERIVED server-side (own owner + selected store inheritance) — body values are
            // the owner-branch contract (zero-Guid / empty list) and must not be validated here.
            // Name rules above still apply to every caller.
            When(x => !_httpContextService.IsOwnerAdmin, () =>
            {
                RuleFor(x => x.OwnerId)
                    .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                    .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                    .MustAsync(OwnerExists).WithMessage(_localizer["OwnerNotFound", "{PropertyName}"]);

                RuleFor(x => x.ModuleIds)
                    .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                    .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                    .MustAsync(AvailableModuleIdsToStore).WithMessage(_localizer["ModuleNotAvailableToStore", "{PropertyName}"]);
            });
        }

        private async Task<bool> IsUniqueName(string name, CancellationToken cancellationToken)
        {
            return await _storeRepository.IsUniqueNameAsync(name);
        }

        private async Task<bool> OwnerExists(Guid ownerId, CancellationToken cancellationToken)
        {
            return await _ownerRepository.GetByIdAsync(ownerId) != null;
        }

        private async Task<bool> AvailableModuleIdsToStore(List<int> moduleIds, CancellationToken cancellationToken)
        {
            IEnumerable<Module> availableModules = await _moduleRepository.GetAvailableModulesToStore();
            HashSet<int> availableModuleIds = availableModules.Select(f => f.Id).ToHashSet();
            return moduleIds.All(availableModuleIds.Contains);
        }

    }
}
