using Application.Dtos.Administration.ReSellers;
using AutoMapper;
using Domain.Entities.ReSellers;

namespace Application.Mappings.Administration
{
    public class ReSellerProfile : Profile
    {
        public ReSellerProfile()
        {
            CreateMap<ReSeller, ReSellerDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.Login, opt => opt.MapFrom(src => src.User.Login))
                .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.User.FullName))
                .ForMember(dest => dest.CellPhone, opt => opt.MapFrom(src => src.User.CellPhone))
                .ForMember(dest => dest.Email, opt => opt.MapFrom(src => src.User.Email));
        }
    }
}
