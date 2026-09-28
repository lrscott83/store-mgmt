using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Images.Commands.RemoveProductImage
{
    /// <summary>Quita una imagen de la galería: borra la fila y el archivo del disco.</summary>
    public sealed record RemoveProductImageCommand(Guid ProductId, string Path) : ICommand<bool>;

    public class RemoveProductImageCommandHandler : ICommandHandler<RemoveProductImageCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IProductImageRepository _productImageRepository;
        private readonly IProductRepository _productRepository;
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;

        public RemoveProductImageCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IProductImageRepository productImageRepository,
            IProductRepository productRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _productImageRepository = productImageRepository;
            _productRepository = productRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(RemoveProductImageCommand request, CancellationToken cancellationToken)
        {
            ProductImage? productImage = await _productImageRepository.GetByProductAndPathAsync(request.ProductId, request.Path);
            if (productImage == null)
                throw new ApiException(_localizer["CatalogImageNotFound"], HttpStatusCode.NotFound);

            await _productImageRepository.DeleteAsync(productImage);

            // El archivo se borra del disco, así que la imagen principal del producto no puede
            // seguir apuntando a él: se limpia en la misma transacción (nunca queda un enlace
            // roto, y el sync no vuelve a publicar una imagen que ya no existe).
            Product? product = await _productRepository.GetByIdAsync(request.ProductId);
            if (product != null && string.Equals(product.Image, request.Path, StringComparison.Ordinal))
            {
                product.Image = null;
                await _productRepository.UpdateAsync(product);
            }

            bool saved = await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0;

            // El archivo se borra solo cuando la fila quedó eliminada: nunca al revés.
            if (saved)
                await _catalogImageStorage.DeleteAsync(request.Path, cancellationToken);

            return ResponseResult.Success(saved);
        }
    }
}
