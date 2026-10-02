using Application.Dtos.Administration.Plans;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Plans;

namespace Application.Mappings.Administration
{
    public class PlanProfile : Profile
    {
        public PlanProfile()
        {
            CreateMap<StorePlan, PlanDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.PlanType, opt => opt.MapFrom(src => ((StorePlanType)src.Id).GetDescription()))
                // THE price rule (ModulePriceCalculator): only ACTIVE and NOT price-included
                // catalog modules contribute, each at its effective price. Previously this summed
                // every member module regardless of IsActive/PriceIncluded.
                .ForMember(dest => dest.Price, opt => opt.MapFrom(src =>
                    ModulePriceCalculator.CalculateTotal(src.StorePlanModules.Select(spm => spm.Module))))
                .ForMember(dest => dest.Modules, opt => opt.MapFrom(src =>
                    src.StorePlanModules.OrderBy(spm => spm.Module.Order)));

            CreateMap<StorePlanModule, PlanModuleDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.ModuleId, opt => opt.MapFrom(src => src.ModuleId))
                .ForMember(dest => dest.Name, opt => opt.MapFrom(src => src.Module.Name))
                .ForMember(dest => dest.Order, opt => opt.MapFrom(src => src.Module.Order))
                .ForMember(dest => dest.PriceIncluded, opt => opt.MapFrom(src => src.Module.PriceIncluded))
                // Additive: the catalog flag the price rule needs (IsBillable = IsActive && !PriceIncluded).
                .ForMember(dest => dest.IsActive, opt => opt.MapFrom(src => src.Module.IsActive))
                .ForMember(dest => dest.Price, opt => opt.MapFrom(src => src.Module.Price))
                .ForMember(dest => dest.CurrentPrice, opt => opt.MapFrom(src =>
                    CurrentPriceServiceUtils.GetCurrentPrice(src.Module.Price, src.Module.PercentDiscountPrice, src.Module.DiscountPrice)))
                .ForMember(dest => dest.DiscountPrice, opt => opt.MapFrom(src => src.Module.DiscountPrice))
                .ForMember(dest => dest.PercentDiscountPrice, opt => opt.MapFrom(src => src.Module.PercentDiscountPrice))
                .ForMember(dest => dest.DiscountText, opt => opt.MapFrom(src =>
                    GetDiscountText(src.Module.Price, src.Module.PercentDiscountPrice, src.Module.DiscountPrice)))
                .ForMember(dest => dest.FeatureDescriptions, opt => opt.MapFrom(src =>
                    src.Module.Features.Select(feature => feature.Description).ToList()));
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