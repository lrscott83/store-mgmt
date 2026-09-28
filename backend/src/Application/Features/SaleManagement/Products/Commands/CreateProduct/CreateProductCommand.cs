using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;

namespace Application.Features.SaleManagement.Products.Commands.CreateProduct
{
    // Los campos del catálogo web (plan 2026-09-27) son opcionales: el alta normal de productos
    // no los envía y el producto nace con los valores por defecto.
    public sealed record CreateProductCommand(Guid CategoryId, string Name, decimal Price, int Order,
        bool AvailableToSale, bool DiscountFromInventory, string BusinessId,
        string? Description = null, int? PercentDiscountPrice = null, int? DiscountPrice = null,
        bool? IsNew = null, string? Image = null) : ICommand<bool> { }

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
                _httpContextService.TenantId.ToGuid(),
                request.Description ?? string.Empty,
                request.PercentDiscountPrice ?? 0,
                request.DiscountPrice ?? 0,
                request.IsNew ?? false,
                request.Image);
            await _productRepository.AddAsync(product);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
