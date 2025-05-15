using Application.Dtos.Administration.Features;
using Application.Dtos.Administration.Modules;
using AutoMapper;
using Domain.Entities.StoreModules;

namespace Application.Mappings.Tenants
{
    public class StoreModuleProfile : Profile
    {
        public StoreModuleProfile() 
        {
            CreateMap<StoreModule, ModuleDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.Id, opt => opt.MapFrom(src => src.Module.Id))
                .ForMember(dest => dest.Name, opt => opt.MapFrom(src => src.Module.Name))
                .ForMember(dest => dest.FeatureDescriptions, opt => opt.MapFrom(src => src.Module.Features.Select(feature => feature.Description).ToList()))
                .ForMember(dest => dest.Order, opt => opt.MapFrom(src => src.Module.Order))
                .ForMember(dest => dest.PriceIncluded, opt => opt.MapFrom(src => src.Module.PriceIncluded))
                .ForMember(dest => dest.Price, opt => opt.MapFrom(src => src.Module.Price))
                .ForMember(dest => dest.DiscountPrice, opt => opt.MapFrom(src => src.Module.DiscountPrice))
                .ForMember(dest => dest.PercentDiscountPrice, opt => opt.MapFrom(src => src.Module.PercentDiscountPrice))
                .ForMember(dest => dest.AvailableToStore, opt => opt.MapFrom(src => src.Module.AvailableToStore));
                //.ForMember(dest => dest.ModuleName, opt => opt.MapFrom(src => src.Feature.Module.Name));
        }
    }
}
