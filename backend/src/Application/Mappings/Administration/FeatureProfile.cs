using Application.Dtos.Administration.Features;
using AutoMapper;
using Domain.Entities.Features;

namespace Application.Mappings.Administration
{
    public class FeatureProfile : Profile
    {
        public FeatureProfile()
        {
            CreateMap<Feature, FeatureDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.DisplayName, opt => opt.MapFrom(src => src.Module.Name + "/" + src.Name));
        }
    }
}
