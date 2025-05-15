using Application.Abstractions.Messaging;
using Application.Dtos.ApplicationManagement.Tenants;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;
using static Domain.Common.Constants.DataUtils;

namespace Application.Features.ApplicationManagement.Tenants.Queries.GetTenants
{
    public sealed record GetTenantsIncludingActiveFeaturesQuery : IQuery<List<TenantDto>> { }

    public class GetTenantsIncludingActiveFeaturesQueryHandler : IQueryHandler<GetTenantsIncludingActiveFeaturesQuery, List<TenantDto>>
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IMapper _mapper;
        public GetTenantsIncludingActiveFeaturesQueryHandler(ITenantRepository tenantRepository, IMapper mapper)
        {
            _tenantRepository = tenantRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<List<TenantDto>>> Handle(GetTenantsIncludingActiveFeaturesQuery query, CancellationToken cancellationToken)
        {
            //var tenants = await _tenantRepository.GetTenantsIncludingActiveFeaturesAndIgnoreQueryFiltersAsync();
            //tenants = tenants.Where(t => t.Id != DefaultTenant.Id);
            //var tenantDtos = _mapper.Map<List<TenantDto>>(tenants.ToList());
            //return await Task.FromResult(ResponseResult.Success(tenantDtos));
            return null;
        }
    }
}
