using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.SaleManagement.Products.Commands.DeleteProduct
{
    public sealed record DeleteProductCommant(Guid Id) : ICommand<bool>
    {    }

    public class DeleteProductCommantHandler : ICommandHandler<DeleteProductCommant, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public DeleteProductCommantHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _productRepository = productRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(DeleteProductCommant request, CancellationToken cancellationToken)
        {
            Product product = await _productRepository.GetByIdAsync(request.Id);
            product.IsActive = false;
            await _productRepository.UpdateAsync(product);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
