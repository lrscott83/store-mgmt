using Application.Abstractions.HttpContext;
using Application.Dtos.Administration.Owners;
using Application.Dtos.StoreManagement;
using Application.Features.StoreManagement.Stores.Commands.CreateStore;
using AutoMapper;
using Domain.Common.Utils;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;

namespace Application.Mappings.StoreManagement
{
    public class StoreProfile : Profile
    {
        public StoreProfile()
        {
            CreateMap<Store, StoreDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                //.ForMember(dest => dest.DisplayName,opt => opt.MapFrom(src => src.Tenant != null && _contextService.IsSuperAdmin ? src.Tenant.Name + " - " + src.Name : src.Name))
                .ForMember(dest => dest.DisplayName, opt => opt.MapFrom(src => src.Name))
                .ForMember(dest => dest.OwnerName, opt => opt.MapFrom(src => src.Owner.User.FullName))
                .ForMember(dest => dest.Modules, opt => opt.MapFrom(src => src.StoreModules));

            CreateMap<Store, StorePlanDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.StoreId, opt => opt.MapFrom(src => src.Id))
                .ForMember(dest => dest.StoreName, opt => opt.MapFrom(src => src.Name))
                .ForMember(dest => dest.Modules, opt => opt.MapFrom(src => src.StoreModules));

            CreateMap<Store, OwnerStoreModuleDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.StoreId, opt => opt.MapFrom(src => src.Id))
                .ForMember(dest => dest.StoreName, opt => opt.MapFrom(src => src.Name))
                .ForMember(dest => dest.StoreModuleTotalCurrentPrice, opt => opt.MapFrom(src => GetStoreModuleTotalCurrentPrice(src.StoreModules)));

            CreateMap<CreateStoreCommand, Store>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter();

        }

        private static float GetStoreModuleTotalCurrentPrice(ICollection<StoreModule> storeModules)
        {
            return storeModules.Sum(sm => CurrentPriceServiceUtils.GetCurrentPrice(sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));
        }
    }
}
