using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;
using Microsoft.Extensions.Localization;
using Resources;
using Application.UnitOfWorks;

namespace Application.Features.ApplicationManagement.Tenants.Commands.UpdateTenant
{
    public sealed record UpdateTenantCommand(
        Guid Id, string Name, string? Description, string? ConnectionString, bool IsActive, IEnumerable<int> FeatureIds) 
        : ICommand<bool> { }

    public class UpdateTenantCommandHandler : ICommandHandler<UpdateTenantCommand, bool>
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IUpdateTenantService _updateTenantService;

        public UpdateTenantCommandHandler(
            IStringLocalizer<I18n> localizer,
            ITenantRepository tenantRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IUpdateTenantService updateTenantService)
        {
            _localizer = localizer;
            _tenantRepository = tenantRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _updateTenantService = updateTenantService;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateTenantCommand request, CancellationToken cancellationToken)
        {
            var tenant = await _tenantRepository.GetByIdAsync(request.Id);
            if (_tenantRepository.Where(t => t.Id != request.Id).Any(t => t.Name == request.Name))
                throw new ValidationException(_localizer["TenantAlreadyExists"]);

            await _updateTenantService.UpdateTenantAsync(
                new UpdateTenantRequestModel(tenant, request.Name, request.Description, request.ConnectionString, request.IsActive, request.FeatureIds));

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
