using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.ApplicationManagement.Tenants.Queries.GetStoreModules
{
    public sealed record GetStoreModulesQuery() 
        :  IQuery<List<string>> { }

    public class GetStoreModulesQueryHandler : IQueryHandler<GetStoreModulesQuery, List<string>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreModuleRepository _storeModuleRepository;

        public GetStoreModulesQueryHandler(
            IHttpContextService httpContextService,
            IStoreModuleRepository storeModuleRepository)
        {
            _httpContextService = httpContextService;
            _storeModuleRepository = storeModuleRepository;
        }

        public async Task<ResponseResult<List<string>>> Handle(GetStoreModulesQuery query, CancellationToken cancellationToken)
        {
            Guid tenantId = _httpContextService.TenantId.ToGuid();

            var modules = await _storeModuleRepository.GetAvailableModulesByStoreIdAsync(tenantId);
            var moduleNames = modules.Select(f => f.Name).ToList();

            //if (_httpContextService.IsSuperAdmin)
            //    moduleNames.Add(FeatureType.Tenants.GetDescription());

            return await Task.FromResult(ResponseResult.Success(moduleNames));
        }
    }
}
