using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.Features.WebCatalog.Sync;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Commands.UpdateProductCatalogFields
{
    /// <summary>
    /// Edita los campos del catálogo web de un producto (decisión D8: se editan SOLO en la vista
    /// Catálogo Web).
    ///
    /// El POS es offline-first: los productos viven en el dispositivo, así que esta vista es la
    /// primera que necesita el producto en el servidor. Por eso el comando también acepta los
    /// HECHOS del producto (nombre, categoría, precio, orden, disponibilidad, moneda y código de
    /// barras) y, si el producto todavía no existe en el backend, crea el espejo con ellos — mismo
    /// criterio que <see cref="CatalogMirrorWriter"/>. Los hechos se refrescan cuando vienen (el POS
    /// es su dueño); los campos del catálogo se aplican siempre que se envíen (null = no tocar).
    ///
    /// No reutiliza <c>PUT /v1/products/{id}</c>: ese endpoint exige el producto COMPLETO y
    /// sobrescribiría lo que esta vista no edita.
    /// </summary>
    public sealed class UpdateProductCatalogFieldsCommand : ICommand<bool>
    {
        public Guid Id { get; set; }

        // --- Hechos del producto (opcionales; obligatorios solo si hay que crear el espejo).
        public Guid? CategoryId { get; set; }
        public string? Name { get; set; }
        public decimal? Price { get; set; }
        public int? Order { get; set; }
        public bool? AvailableToSale { get; set; }
        public bool? IsActive { get; set; }
        /// <summary>Moneda por VALOR del enum `Currency`.</summary>
        public int? Currency { get; set; }
        public string? BusinessId { get; set; }
        public bool? DiscountFromInventory { get; set; }

        // --- Campos del catálogo web (los propios de esta vista).
        /// <summary>Descripción del catálogo: texto plano, nunca HTML (decisión D9).</summary>
        public string? Description { get; set; }
        /// <summary>% de descuento escalado (1250 == 12.50 %).</summary>
        public int? PercentDiscountPrice { get; set; }
        /// <summary>Monto rebajado escalado (500 == 5.00).</summary>
        public int? DiscountPrice { get; set; }
        /// <summary>Marca "Nuevo" del catálogo.</summary>
        public bool? IsNew { get; set; }
        /// <summary>Clave de la imagen principal del catálogo.</summary>
        public string? Image { get; set; }
        /// <summary>true para limpiar la imagen principal.</summary>
        public bool RemoveImage { get; set; }
    }

    public class UpdateProductCatalogFieldsCommandHandler
        : ICommandHandler<UpdateProductCatalogFieldsCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateProductCatalogFieldsCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository,
            IProductCategoryRepository productCategoryRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
            _productCategoryRepository = productCategoryRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateProductCatalogFieldsCommand request,
            CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            Product? product = await _productRepository.GetByIdAsync(request.Id);

            if (product == null)
            {
                product = await CreateMirrorAsync(request, storeId);
            }
            else
            {
                // 404 uniforme: un producto inexistente y uno de OTRA tienda del mismo tenant
                // responden igual, así el catálogo de una tienda nunca se edita desde otra.
                await EnsureBelongsToStoreAsync(product, storeId, request.Id);
                await ApplyFactsAsync(product, request, storeId);
                await _productRepository.UpdateAsync(product);
            }

            if (request.Description != null)
                product.Description = request.Description;
            if (request.PercentDiscountPrice.HasValue)
                product.PercentDiscountPrice = request.PercentDiscountPrice.Value;
            if (request.DiscountPrice.HasValue)
                product.DiscountPrice = request.DiscountPrice.Value;
            if (request.IsNew.HasValue)
                product.IsNew = request.IsNew.Value;

            // Quitar la imagen principal limpia SOLO `Product.Image`. La galería es un dato aparte y
            // NO se borra aquí: el E2E `Remove_image_clears_the_main_image_only` fija exactamente esa
            // separación. Y aunque sus filas se quedaran, el catálogo público ya no las lee —la
            // fuente única es `Product.Image` (PublicCatalogProductMapper)—, así que no pueden
            // publicar una foto fantasma.
            if (request.RemoveImage)
                product.Image = null;
            else if (request.Image != null)
                product.Image = request.Image;

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }

    /// <summary>
    /// Primer guardado de un producto que solo existe en el dispositivo: se crea su espejo con
    /// el id local (el POS es dueño del id) y los hechos que envía la vista.
    ///
    /// Sin los hechos no hay nada que crear, así que la respuesta es 404 — el producto de esa URL
    /// no existe — y no 400: el cuerpo de la petición es válido, el que no existe es el recurso.
    /// Así un id inventado y uno de OTRA tienda responden igual (404 uniforme, sin filtrar a quién
    /// pertenece), y el mensaje explica qué hacen falta para crearlo.
    /// </summary>
    private async Task<Product> CreateMirrorAsync(UpdateProductCatalogFieldsCommand request, Guid storeId)
    {
        if (request.CategoryId is not { } categoryId || string.IsNullOrWhiteSpace(request.Name))
            throw new ApiException(_localizer["CatalogSnapshotProductRequired"], HttpStatusCode.NotFound);

            ProductCategory? category = await _productCategoryRepository.GetByIdAsync(categoryId);
            if (category == null || category.StoreId != storeId)
                throw new ApiException(_localizer["ProductNotFound", nameof(request.Id)], HttpStatusCode.NotFound);

            Product product = Product.Create(request.Id, request.Name!, categoryId, request.Price ?? 0,
                request.Order ?? 0, request.AvailableToSale ?? true, request.DiscountFromInventory ?? true,
                request.BusinessId ?? string.Empty, _httpContextService.TenantId.ToGuid());
            product.Currency = CatalogMirrorWriter.ToCurrency(request.Currency);
            await _productRepository.AddAsync(product);
            return product;
        }

        /// <summary>
        /// Los hechos los manda el POS (es su dueño), así que un valor presente pisa al del servidor;
        /// un campo ausente se deja como está. Si la categoría cambió, tiene que ser de esta tienda.
        /// </summary>
        private async Task ApplyFactsAsync(Product product, UpdateProductCatalogFieldsCommand request, Guid storeId)
        {
            if (request.CategoryId is { } categoryId && categoryId != product.CategoryId)
            {
                ProductCategory? category = await _productCategoryRepository.GetByIdAsync(categoryId);
                if (category == null || category.StoreId != storeId)
                    throw new ApiException(_localizer["ProductNotFound", nameof(request.Id)], HttpStatusCode.NotFound);

                product.CategoryId = categoryId;
            }

            if (!string.IsNullOrWhiteSpace(request.Name))
                product.Name = request.Name!;
            if (request.Price.HasValue)
                product.Price = request.Price.Value;
            if (request.Order.HasValue)
                product.Order = request.Order.Value;
            if (request.AvailableToSale.HasValue)
                product.AvailableToSale = request.AvailableToSale.Value;
            if (request.IsActive.HasValue)
                product.IsActive = request.IsActive.Value;
            if (request.Currency.HasValue)
                product.Currency = CatalogMirrorWriter.ToCurrency(request.Currency);
            if (!string.IsNullOrWhiteSpace(request.BusinessId))
                product.BusinessId = request.BusinessId!;
            if (request.DiscountFromInventory.HasValue)
                product.DiscountFromInventory = request.DiscountFromInventory.Value;
        }

        private async Task EnsureBelongsToStoreAsync(Product product, Guid storeId, Guid productId)
        {
            ProductCategory? category = await _productCategoryRepository.GetByIdAsync(product.CategoryId);
            if (category == null || category.StoreId != storeId)
                throw new ApiException(_localizer["ProductNotFound", nameof(productId)], HttpStatusCode.NotFound);
        }
    }
}
