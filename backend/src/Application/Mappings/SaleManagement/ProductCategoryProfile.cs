using Application.Dtos.SaleManagement;
using AutoMapper;
using Domain.Entities.ProductCategories;

namespace Application.Mappings.ProductCategoryManagement
{
    public class ProductCategoryProfile : Profile
    {
        public ProductCategoryProfile()
        {
            CreateMap<ProductCategory, ProductCategoryDto>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter();

            CreateMap<ProductCategory, ProductCategoryView>()
                .IgnoreAllSourcePropertiesWithAnInaccessibleSetter()
                .ForMember(dest => dest.ProductsCount, 
                    opt => opt.MapFrom(src => src.Products.Where(p => p.IsActive && p.AvailableToSale).Count()));

        }
    }
}
