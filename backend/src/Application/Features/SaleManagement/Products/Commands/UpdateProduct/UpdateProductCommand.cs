using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.ComponentModel.DataAnnotations;

namespace Application.Features.SaleManagement.Products.Commands.UpdateProduct
{
    public sealed class UpdateProductCommand : ICommand<bool>
    {
        public Guid Id { get; set; }
        public Guid CategoryId { get; set; }
        public string Name { get; set; }
        public decimal Price { get; set; }
        public bool AvailableToSale { get; set; }
        public bool DiscountFromInventory { get; set; }
        public string BusinessId { get; set; }
        public int Order { get; set; }
        public bool IsActive { get; set; }

    }

    public class UpdateProductCommandHandler : ICommandHandler<UpdateProductCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateProductCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _productRepository = productRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateProductCommand request, CancellationToken cancellationToken)
        {
            Product product = await _productRepository.GetByIdAsync(request.Id);
            if (_productRepository.Where(s => s.Id != request.Id).Any(s => s.Name == request.Name))
                throw new ValidationException(_localizer["ProductAlreadyExists", request.Name]);

            product.Name = request.Name;
            product.CategoryId = request.CategoryId;
            product.Price = request.Price;
            product.AvailableToSale = request.AvailableToSale;
            product.DiscountFromInventory = request.DiscountFromInventory;
            product.BusinessId = request.BusinessId;
            product.Order = request.Order;
            product.IsActive = request.IsActive;
            await _productRepository.UpdateAsync(product);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
