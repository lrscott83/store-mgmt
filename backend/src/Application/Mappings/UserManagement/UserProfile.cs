using Application.Dtos.Common;
using Application.Dtos.UserManagement;
using AutoMapper;
using Domain.Entities.Roles;
using Domain.Entities.Users;

namespace Application.Mappings.UserManagement
{
    public class UserProfile : Profile
    {
        public UserProfile() 
        {
            CreateMap<User, UserListDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.OwnerName, opt => opt.MapFrom(src => src.StoreUser.Store.Owner.User.FullName))
                .ForMember(dest => dest.StoreName, opt => opt.MapFrom(src => src.StoreUser.Store.Name))
                .ForMember(dest => dest.RoleNames, opt => opt.MapFrom(src => src.UserRoles.Select(ur => ur.Role.Name)));

            CreateMap<User, UserDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.OwnerName, opt => opt.MapFrom(src => src.StoreUser.Store.Owner.User.FullName))
                .ForMember(dest => dest.StoreName, opt => opt.MapFrom(src => src.StoreUser.Store.Name))
                .ForMember(dest => dest.RoleNames, opt => opt.MapFrom(src => src.UserRoles.Select(ur => ur.Role.Name)));
        }
    }
}
