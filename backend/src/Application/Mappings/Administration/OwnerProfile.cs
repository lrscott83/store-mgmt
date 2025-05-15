using Application.Dtos.Administration.Owners;
using AutoMapper;
using Domain.Entities.Owners;

namespace Application.Mappings.Administration
{
    public class OwnerProfile : Profile
    {
        public OwnerProfile()
        {
            CreateMap<Owner, OwnerDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.Login, opt => opt.MapFrom(src => src.User.Login))
                .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.User.FullName))
                .ForMember(dest => dest.CellPhone, opt => opt.MapFrom(src => src.User.CellPhone))
                .ForMember(dest => dest.Email, opt => opt.MapFrom(src => src.User.Email))
                .ForMember(dest => dest.StoreModules, opt => opt.MapFrom(src => src.Stores));
        }
    }
}
