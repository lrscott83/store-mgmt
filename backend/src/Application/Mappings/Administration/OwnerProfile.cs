using Application.Dtos.Administration.Owners;
using AutoMapper;
using Domain.Common.Utils;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.StoreModules;

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
                .ForMember(dest => dest.ReSellerId, opt => opt.MapFrom(src => GetReSellerId(src.ReSellerOwner)))
                .ForMember(dest => dest.ReSellerName, opt => opt.MapFrom(src => GetReSellerName(src.ReSellerOwner)))
                .ForMember(dest => dest.Approved, opt => opt.MapFrom(src => src.Stores.Any(s => s.Approved && s.IsActive)))
                .ForMember(dest => dest.StoreModules, opt => opt.MapFrom(src => src.Stores));
        }

        private static Guid? GetReSellerId(ReSellerOwner reSellerOwner)
        {
            return reSellerOwner?.ReSellerId;
        }

        private static string? GetReSellerName(ReSellerOwner reSellerOwner)
        {
            return reSellerOwner?.ReSeller?.User?.FullName;
        }
    }
}
