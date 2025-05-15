using Application.Abstractions.Messaging;
using Application.Dtos.ApplicationManagement.Tenants;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;

namespace Application.Features.ApplicationManagement.Tenants.Queries.GetTenants
{
    public sealed record GetAllTenantsQuery : IQuery<List<TenantDto>> { }

    public class GetAllTenantsQueryHandler : IQueryHandler<GetAllTenantsQuery, List<TenantDto>>
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IMapper _mapper;
        public GetAllTenantsQueryHandler(ITenantRepository tenantRepository, IMapper mapper)
        {
            _tenantRepository = tenantRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<List<TenantDto>>> Handle(GetAllTenantsQuery query, CancellationToken cancellationToken)
        {
            var tenants = await _tenantRepository.GetAllAsync();
            var tenantDtos = _mapper.Map<List<TenantDto>>(tenants.ToList());
            return await Task.FromResult(ResponseResult.Success(tenantDtos));
        }
    }
}
