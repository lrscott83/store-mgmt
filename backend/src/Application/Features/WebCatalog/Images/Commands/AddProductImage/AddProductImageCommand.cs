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
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;

        public AddProductImageCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository,
            IProductImageRepository productImageRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
            _productImageRepository = productImageRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
        }

        public async Task<ResponseResult<string>> Handle(AddProductImageCommand request, CancellationToken cancellationToken)
        {
            Product? product = await _productRepository.GetByIdAsync(request.ProductId);
            if (product == null)
                throw new ApiException(_localizer["ProductNotFound", nameof(request.ProductId)], HttpStatusCode.NotFound);

            IList<ProductImage> existingImages = await _productImageRepository.GetByProductIdAsync(request.ProductId);
            if (existingImages.Count >= ProductEntityLimits.MaxImagesPerProduct)
                throw new ApiException(
                    _localizer["CatalogImagesLimitReached", ProductEntityLimits.MaxImagesPerProduct],
                    HttpStatusCode.BadRequest);

            CatalogImageUploadRules.EnsureValid(request.FileName, request.ContentType, request.Length, _localizer);

            Guid tenantId = _httpContextService.TenantId.ToGuid();
            Guid storeId = _httpContextService.StoreId.ToGuid();

            string key = await _catalogImageStorage.SaveAsync(
                new CatalogImageUpload(request.Content, request.FileName, request.ContentType, request.Length),
                tenantId,
                storeId,
                request.ProductId,
                cancellationToken);

            int order = existingImages.Count == 0 ? 0 : existingImages.Max(image => image.Order) + 1;
            ProductImage productImage = ProductImage.Create(request.ProductId, key, order, tenantId);
            await _productImageRepository.AddAsync(productImage);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(key);
        }
    }
}
