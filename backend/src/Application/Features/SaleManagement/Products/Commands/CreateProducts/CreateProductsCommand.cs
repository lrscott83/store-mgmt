using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.Products.Commands.CreateProducts
{
    public sealed record CreateProductsCommand(Guid CategoryId, List<SimpleProductDto> Products) : ICommand<bool>
    { }

    public class CreateProductsCommandHandler : ICommandHandler<CreateProductsCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;

        public CreateProductsCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
        }

        public async Task<ResponseResult<bool>> Handle(CreateProductsCommand request, CancellationToken cancellationToken)
        {
            IList<Product> categoryProducts = await _productRepository.GetProductsByCategoryIdAsync(request.CategoryId);
            int maxOrder = categoryProducts.Max(p => p.Order);
            IList<string> insertedProductNames = new List<string>();
            request.Products
                .Where(p => !string.IsNullOrEmpty(p.Name) && p.Price >= 0).ToList()
                .ForEach(async p =>
            {
                if (!insertedProductNames.Contains(p.Name) && categoryProducts.All(prod => prod.Name != p.Name))
                {
                    Product product = Product.Create(p.Name, request.CategoryId, p.Price, ++maxOrder,
                        true, true, "", _httpContextService.TenantId.ToGuid());
                    await _productRepository.AddAsync(product);
                    insertedProductNames.Add(p.Name);
                }

            });
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
