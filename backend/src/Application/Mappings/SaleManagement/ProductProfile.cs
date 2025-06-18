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
                .ForMember(dest => dest.CategoryName, opt => opt.MapFrom(src => src.Category.Name));

            CreateMap<Product, SimpleProductDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter();

            CreateMap<Product, ProductToEntryDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.FullName, opt => opt.MapFrom(src => src.Category.Name + " - " + src.Name));
        }
    }
}
