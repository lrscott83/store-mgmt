using Application.Dtos.Common;
using AutoMapper;
using Domain.Entities.Roles;

namespace Application.Mappings.UserManagement
{
    public class RoleProfile : Profile
    {
        public RoleProfile() 
        {
            CreateMap<Role, ListViewDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.Text, opt => opt.MapFrom(src => src.Name));
        }
    }
}
