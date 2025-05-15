using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.ApplicationManagement.Tenants.Commands.SetMyTenant
{
    public class SetMyTenantCommandValidator : AbstractValidator<SetMyTenantCommand>
    {
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ITenantRepository _tenantRepository;
        public SetMyTenantCommandValidator(IStringLocalizer<I18n> localizer, ITenantRepository tenantRepository)
        {
            _localizer = localizer;
            _tenantRepository = tenantRepository;

            RuleFor(x => x.TenantId)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .MustAsync(TenantExists).WithMessage(_localizer["TenantNotFound", "{PropertyName}"]);
            
        }
        private async Task<bool> TenantExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _tenantRepository.GetByIdAsync(tenantId) != null;
        }
    }
}
