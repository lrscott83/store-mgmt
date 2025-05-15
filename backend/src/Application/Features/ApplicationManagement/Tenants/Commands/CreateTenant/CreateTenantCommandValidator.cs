using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.ApplicationManagement.Tenants.Commands.CreateTenant
{
    public class CreateTenantCommandValidator : AbstractValidator<CreateTenantCommand>
    {
        private readonly IFeatureRepository _featureRepository;
        private readonly ITenantRepository _tenantRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public CreateTenantCommandValidator(IStringLocalizer<I18n> localizer, IFeatureRepository featureRepository, ITenantRepository tenantRepository)
        {
            _featureRepository = featureRepository;
            _tenantRepository = tenantRepository;
            _localizer = localizer;

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(IsUniqueName).WithMessage(_localizer["TenantAlreadyExists", "{PropertyName}"]);

            RuleFor(x => x.Description)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.FeatureIds)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(FeaturesExists).WithMessage(_localizer["FeatureNotFound", "{PropertyName}"]);
            
        }

        private async Task<bool> IsUniqueName(string name, CancellationToken cancellationToken)
        {
            return await _tenantRepository.IsUniqueNameAsync(name);
        }

        private async Task<bool> FeaturesExists(IEnumerable<int> featuresIds, CancellationToken cancellationToken)
        {
            foreach (var featureId in featuresIds)
            {
                if (await _featureRepository.GetByIdAsync(featureId) == null)
                    return false;
            }
            return true;
        }

    }
}
