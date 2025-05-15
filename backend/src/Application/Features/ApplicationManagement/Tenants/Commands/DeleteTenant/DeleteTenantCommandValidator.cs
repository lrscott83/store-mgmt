using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.ApplicationManagement.Tenants.Commands.DeleteTenant
{
    public class DeleteTenantCommandValidator : AbstractValidator<DeleteTenantCommand>
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public DeleteTenantCommandValidator(IStringLocalizer<I18n> localizer, ITenantRepository tenantRepository)
        {
            _localizer = localizer;
            _tenantRepository = tenantRepository;

            RuleFor(x => x.Id)
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotNull()
              .MustAsync(TenantExists).WithMessage(_localizer["TenantNotFound", "{PropertyName}"]);
            
        }

        private async Task<bool> TenantExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _tenantRepository.GetByIdAsync(tenantId) != null;
        }
    }
}
