using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
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
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IProductImageRepository _productImageRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public ReorderProductImagesCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository,
            IProductCategoryRepository productCategoryRepository,
            IProductImageRepository productImageRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
            _productCategoryRepository = productCategoryRepository;
            _productImageRepository = productImageRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(ReorderProductImagesCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            Product? product = await _productRepository.GetByIdAsync(request.ProductId);
            if (product == null)
                throw new ApiException(_localizer["ProductNotFound", nameof(request.ProductId)], HttpStatusCode.NotFound);

            // 404 uniforme: un producto de OTRA tienda del mismo tenant responde igual que uno
            // inexistente, así el catálogo de una tienda nunca se edita desde otra.
            await ProductStoreAccess.EnsureBelongsToStoreAsync(
                product, storeId, _productCategoryRepository, _localizer, request.ProductId);

            IList<string> requestedPaths = request.Paths ?? new List<string>();
            IList<ProductImage> images = await _productImageRepository.GetByProductIdAsync(request.ProductId);

            // El guard exige una BIYECCIÓN, no solo "mismo conjunto": `["a","a"]` pasaba contra
            // `["a","b"]` (mismo conteo + contención) y el bucle resolvía "a" dos veces, dejando "b"
            // con su orden viejo → galería corrupta respondiendo `200 data:true`.
            var byPath = images.ToDictionary(image => image.Path);
            bool sameSet = requestedPaths.Count == byPath.Count
                && requestedPaths.Distinct(StringComparer.Ordinal).Count() == requestedPaths.Count
                && requestedPaths.All(byPath.ContainsKey);
            if (!sameSet)
                throw new ApiException(_localizer["CatalogImageNotFound"], HttpStatusCode.BadRequest);

            for (int index = 0; index < requestedPaths.Count; index++)
            {
                ProductImage image = byPath[requestedPaths[index]];
                image.Order = index;
                await _productImageRepository.UpdateAsync(image);
            }

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
