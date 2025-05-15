using Application.Dtos.Administration.Owners;
using Application.Dtos.Management.StoreUsers;
using AutoMapper;
using Domain.Entities.Owners;
using Domain.Entities.StoreUsers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Mappings.Management
{
    public class StoreUserProfile : Profile
    {
        public StoreUserProfile()
        {
            CreateMap<StoreUser, StoreUserDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.StoreName, opt => opt.MapFrom(src => src.Store.Name))
                .ForMember(dest => dest.Login, opt => opt.MapFrom(src => src.User.Login))
                .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.User.FullName))
                .ForMember(dest => dest.CellPhone, opt => opt.MapFrom(src => src.User.CellPhone))
                .ForMember(dest => dest.Email, opt => opt.MapFrom(src => src.User.Email));
        }
    }
}
