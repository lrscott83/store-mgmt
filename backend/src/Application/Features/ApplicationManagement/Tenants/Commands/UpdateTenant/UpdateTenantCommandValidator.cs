using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.ApplicationManagement.Tenants.Commands.UpdateTenant
{
    public class UpdateTenantCommandValidator : AbstractValidator<UpdateTenantCommand>
    {
        private readonly IFeatureRepository _featureRepository;
        private readonly ITenantRepository _tenantRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateTenantCommandValidator(IStringLocalizer<I18n> localizer, IFeatureRepository featureRepository, ITenantRepository tenantRepository)
        {
            _featureRepository = featureRepository;
            _tenantRepository = tenantRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(TenantExists).WithMessage(_localizer["TenantNotFound", "{PropertyName}"]);

            RuleFor(x => x.Name)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.Description)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.FeatureIds)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(FeaturesExists).WithMessage(_localizer["FeatureNotFound", "{PropertyName}"]);

        }

        private async Task<bool> TenantExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _tenantRepository.GetByIdAsync(tenantId) != null;
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
