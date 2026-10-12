using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Common.Limits;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Images.Commands.AddProductImage
{
    /// <summary>
    /// Sube una imagen a la galería del catálogo web de un producto y devuelve su clave.
    /// El archivo llega como stream para que la capa Application no dependa de ASP.NET.
    /// </summary>
    public sealed record AddProductImageCommand(Guid ProductId, Stream Content, string FileName, string ContentType, long Length)
        : ICommand<string>;

    public class AddProductImageCommandHandler : ICommandHandler<AddProductImageCommand, string>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;
        private readonly IProductImageRepository _productImageRepository;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;

        public AddProductImageCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository,
            IProductImageRepository productImageRepository,
            IProductCategoryRepository productCategoryRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
            _productImageRepository = productImageRepository;
            _productCategoryRepository = productCategoryRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
        }

        public async Task<ResponseResult<string>> Handle(AddProductImageCommand request, CancellationToken cancellationToken)
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

            IList<ProductImage> existingImages = await _productImageRepository.GetByProductIdAsync(request.ProductId);
            if (existingImages.Count >= ProductEntityLimits.MaxImagesPerProduct)
                throw new ApiException(
                    _localizer["CatalogImagesLimitReached", ProductEntityLimits.MaxImagesPerProduct],
                    HttpStatusCode.BadRequest);

            CatalogImageUploadRules.EnsureValid(request.FileName, request.ContentType, request.Length, _localizer);

            Guid tenantId = _httpContextService.TenantId.ToGuid();

            string key = await _catalogImageStorage.SaveAsync(
                new CatalogImageUpload(request.Content, request.FileName, request.ContentType, request.Length),
                tenantId,
                storeId,
                request.ProductId,
                cancellationToken);

            int order = existingImages.Count == 0 ? 0 : existingImages.Max(image => image.Order) + 1;
            ProductImage productImage = ProductImage.Create(request.ProductId, key, order, tenantId);
            await _productImageRepository.AddAsync(productImage);

            // La PRIMERA imagen del producto alimenta además la fuente única, `Product.Image`
            // (decisión del Owner, 2026-10-01): es la columna que lee el catálogo público, así que
            // sin esto la imagen solo aparecería en la galería. Las siguientes NO la pisan (la
            // principal es la que manda) y la fila de galería se sigue creando igual, que es lo que
            // lee la galería comentada cuando se restaure.
            if (existingImages.Count == 0)
            {
                product.Image = key;
                await _productRepository.UpdateAsync(product);
            }

            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(key);
        }
    }
}
