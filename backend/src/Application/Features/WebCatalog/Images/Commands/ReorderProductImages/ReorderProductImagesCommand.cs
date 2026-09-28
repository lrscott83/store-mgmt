using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Images.Commands.ReorderProductImages
{
    /// <summary>
    /// Reordena la galería: <paramref name="Paths"/> es el orden final que se quiere ver.
    /// Debe incluir exactamente las imágenes actuales del producto (no crea ni borra).
    /// </summary>
    public sealed record ReorderProductImagesCommand(Guid ProductId, List<string> Paths) : ICommand<bool>;

    public class ReorderProductImagesCommandHandler : ICommandHandler<ReorderProductImagesCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IProductImageRepository _productImageRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public ReorderProductImagesCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IProductImageRepository productImageRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _productImageRepository = productImageRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(ReorderProductImagesCommand request, CancellationToken cancellationToken)
        {
            IList<string> requestedPaths = request.Paths ?? new List<string>();
            IList<ProductImage> images = await _productImageRepository.GetByProductIdAsync(request.ProductId);

            bool sameSet = images.Count == requestedPaths.Count
                && images.All(image => requestedPaths.Contains(image.Path));
            if (!sameSet)
                throw new ApiException(_localizer["CatalogImageNotFound"], HttpStatusCode.BadRequest);

            for (int index = 0; index < requestedPaths.Count; index++)
            {
                ProductImage image = images.First(i => i.Path == requestedPaths[index]);
                image.Order = index;
                await _productImageRepository.UpdateAsync(image);
            }

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
