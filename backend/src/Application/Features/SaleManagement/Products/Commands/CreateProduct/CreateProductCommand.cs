using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.Products.Commands.CreateProduct
{
    public sealed record CreateProductCommand(Guid CategoryId, string Name, decimal Price, int Order,
        bool AvailableToSale, bool DiscountFromInventory, string BusinessId) : ICommand<bool> { }

    public class CreateProductCommandHandler : ICommandHandler<CreateProductCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;

        public CreateProductCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
        }

        public async Task<ResponseResult<bool>> Handle(CreateProductCommand request, CancellationToken cancellationToken)
        {
            Product product = Product.Create(request.Name, request.CategoryId, request.Price, request.Order,
                request.AvailableToSale, request.DiscountFromInventory, request.BusinessId, 
                _httpContextService.TenantId.ToGuid());
            await _productRepository.AddAsync(product);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
