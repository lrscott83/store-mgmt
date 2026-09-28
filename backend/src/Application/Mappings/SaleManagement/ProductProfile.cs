using Application.Dtos.SaleManagement;
using AutoMapper;
using Domain.Entities.Products;

namespace Application.Mappings.ProductManagement
{
    public class ProductProfile : Profile
    {
        public ProductProfile()
        {
            CreateMap<Product, ProductDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.CategoryName, opt => opt.MapFrom(src => src.Category.Name))
                // Catálogo web (plan 2026-09-27): la galería sale como lista ordenada de claves y el
                // precio final lo calcula el Domain (CatalogPricing), no se persiste.
                .ForMember(dest => dest.Images,
                    opt => opt.MapFrom(src => src.Images.OrderBy(i => i.Order).ThenBy(i => i.CreatedDate).Select(i => i.Path).ToList()))
                .ForMember(dest => dest.FinalPrice, opt => opt.MapFrom(src => src.FinalPrice))
                .ForMember(dest => dest.HasDiscount, opt => opt.MapFrom(src => src.HasDiscount));

            CreateMap<Product, SimpleProductDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter();

            CreateMap<Product, ProductToEntryDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.Category.Name + " - " + src.Name));
        }
    }
}
