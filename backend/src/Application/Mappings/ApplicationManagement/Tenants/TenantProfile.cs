using Application.Dtos.ApplicationManagement.Tenants;
using Application.Features.ApplicationManagement.Tenants.Commands.CreateTenant;
using AutoMapper;
using Domain.Entities.Tenants;
using Domain.Interfaces.Services.Tenants;

namespace Application.Mappings.ApplicationManagement.Tenants
{
    public class TenantProfile : Profile
    {
        public TenantProfile()
        {
            CreateMap<Tenant, TenantDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter();

            CreateMap<CreateTenantCommand, Tenant>()
               .IgnoreAllSourcePropertiesWithAnInaccessibleSetter();

            CreateMap<CreateTenantCommand, CreateTenantRequestModel>()
               .IgnoreAllSourcePropertiesWithAnInaccessibleSetter();
        }
    }
}
