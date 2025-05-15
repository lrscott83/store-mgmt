using Application.Abstractions.Messaging;
using Application.Dtos.ApplicationManagement.Tenants;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;

namespace Application.Features.ApplicationManagement.Tenants.Queries.GetTenantById
{
    public sealed record GetTenantByIdQuery(Guid Id) : IQuery<TenantDto> { }

    public class GetAllTenantsQueryHandler : IQueryHandler<GetTenantByIdQuery, TenantDto>
    {
        private readonly ITenantRepository _tenantRepository;
        private readonly IMapper _mapper;

        public GetAllTenantsQueryHandler(
            IMapper mapper,
            ITenantRepository tenantRepository)
        {
            _mapper = mapper;
            _tenantRepository = tenantRepository;
        }

        public async Task<ResponseResult<TenantDto>> Handle(GetTenantByIdQuery query, CancellationToken cancellationToken)
        {
            //var tenant = await _tenantRepository.GetTenantByIdIncludingActiveFeaturesAndIgnoreQueryFiltersAsync(query.Id);
            //TenantDto tenantDto = _mapper.Map<TenantDto>(tenant);
            //return await Task.FromResult(ResponseResult.Success(tenantDto));
            return null;
        }
    }
}
