using Application.Abstractions.HttpContext;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.CreateStore
{
    /// <summary>
    /// store-birth-superior (2026-10-11, replaces store-birth-pago-only): there is no
    /// <c>ModuleIds</c> to validate any more. The birth module set is the Superior plan catalog
    /// filtered by <c>Module.IsActive &amp;&amp; Module.AvailableToStore</c>, derived server-side by
    /// <see cref="Domain.Interfaces.Services.Stores.ICreateStoreService"/> — so
    /// <see cref="IModuleRepository"/> and <see cref="IPlanRepository"/> are gone from this
    /// validator along with the rules that used them.
    /// </summary>
    public class CreateStoreCommandValidator : AbstractValidator<CreateStoreCommand>
    {
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateStoreCommandValidator(IStringLocalizer<I18n> localizer, IOwnerRepository ownerRepository, 
            IStoreRepository storeRepository, IHttpContextService httpContextService)
        {
            _ownerRepository = ownerRepository;
            _storeRepository = storeRepository;
            _httpContextService = httpContextService;
            _localizer = localizer;

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(IsUniqueName).WithMessage(_localizer["UserAlreadyExists", "{PropertyName}"]);

            // Owner branch (user-approved StoreCreation): OwnerId is DERIVED server-side (own
            // owner) — the body value is the owner-branch contract (zero-Guid) and must not be
            // validated here. Name rules above still apply to every caller.
            When(x => !_httpContextService.IsOwnerAdmin, () =>
            {
                RuleFor(x => x.OwnerId)
                    .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                    .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                    .MustAsync(OwnerExists).WithMessage(_localizer["OwnerNotFound", "{PropertyName}"]);
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
    }
}