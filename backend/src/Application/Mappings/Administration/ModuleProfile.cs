using Application.Dtos.Administration.Modules;
using AutoMapper;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;

namespace Application.Mappings.Administration
{
    public class ModuleProfile : Profile
    {
        public ModuleProfile()
        {
            CreateMap<Module, ModuleDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.CurrentPrice, opt => opt.MapFrom(src =>
                    CurrentPriceServiceUtils.GetCurrentPrice(src.Price, src.PercentDiscountPrice, src.DiscountPrice)))
                .ForMember(dest => dest.DiscountText, opt => opt.MapFrom(src => 
                    GetDiscountText(src.Price, src.PercentDiscountPrice, src.DiscountPrice)));

            CreateMap<StoreModule, ModuleDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.Id, opt => opt.MapFrom(src => src.ModuleId))
                .ForMember(dest => dest.Name, opt => opt.MapFrom(src => src.Module.Name))
                .ForMember(dest => dest.Order, opt => opt.MapFrom(src => src.Module.Order))
                .ForMember(dest => dest.PriceIncluded, opt => opt.MapFrom(src => src.ModulePriceIncluded))
                .ForMember(dest => dest.AvailableToStore, opt => opt.MapFrom(src => src.Module.AvailableToStore))
                .ForMember(dest => dest.CurrentPrice, opt => opt.MapFrom(src =>
                    CurrentPriceServiceUtils.GetCurrentPrice(src.Price, src.ModulePercentDiscountPrice, src.ModuleDiscountPrice)))
                .ForMember(dest => dest.DiscountText, opt => opt.MapFrom(src => 
                    GetDiscountText(src.Price, src.ModulePercentDiscountPrice, src.ModuleDiscountPrice)));
        }

        private static string GetDiscountText(float price, float percentDiscountPrice, float discountPrice)
        {
            string discountText = "";
            if (percentDiscountPrice > 0)
                discountText = "- " + percentDiscountPrice + "%";
            if (discountPrice > 0)
            {
                if (!string.IsNullOrEmpty(discountText))
                    discountText += " y ";
                discountText += "- $" + discountPrice;
            }
            return discountText;
        }
    }
}
