using Application.Abstractions.HttpContext;
using Domain.Common.Constants;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;

namespace Domain.Entities.Stores
{
    public class GetStoreByIdService : IGetStoreByIdService
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreRepository _storeRepository;

        public GetStoreByIdService(IHttpContextService httpContextService, IStoreRepository storeRepository)
        {
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
        }

        public async Task<Store> GetStoreByIdIncludingModulesAsync(Guid id)
        {
            return _httpContextService.IsSuperAdmin && _httpContextService.TenantId == DataUtils.DefaultTenant.Id.ToString()
                ? await _storeRepository.GetStoreByIdIncludingModulesIgnoreQueryFiltersAsync(id)
                : await _storeRepository.GetStoreByIdIncludingModulesAsync(id);
        }
    }
}
