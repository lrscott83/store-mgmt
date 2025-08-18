using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.ApplicationManagement.Tenants.Commands.DeleteTenant
{
    public sealed record DeleteTenantCommand(Guid Id) : ICommand<bool>  { }

    public class DeleteTenantCommandHandler : ICommandHandler<DeleteTenantCommand, bool>
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;

        public DeleteTenantCommandHandler(ITenantRepository tenantRepository, IStoreModuleRepository storeModuleRepository, IApplicationUnitOfWork applicationUnitOfWork)
        {
            _tenantRepository = tenantRepository;
            _storeModuleRepository = storeModuleRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
        }

        
        public async Task<ResponseResult<bool>> Handle(DeleteTenantCommand request, CancellationToken cancellationToken)
        {
            var tenant = await _tenantRepository.GetByIdAsync(request.Id);
            tenant.IsActive = false;
            await _tenantRepository.UpdateAsync(tenant);

            var storeModules = _storeModuleRepository.Where(tm => tm.TenantId == request.Id).IgnoreQueryFilters();
            foreach (var storeModule in storeModules)
            {
                storeModule.IsActive = false;
                await _storeModuleRepository.UpdateAsync(storeModule);
            }

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
