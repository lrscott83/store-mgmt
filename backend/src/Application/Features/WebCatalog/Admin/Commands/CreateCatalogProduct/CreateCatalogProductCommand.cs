using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Public;
using Application.Features.WebCatalog.Sync;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
using Domain.Common.Extensions;
using Domain.Common.Results;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Admin.Commands.CreateCatalogProduct
{
    /// <summary>
    /// Alta de un producto del catálogo desde la vista SuperAdmin, sobre la MISMA tabla `Product`
    /// que ya usa el catálogo. No depende de sincronizar ni de un snapshot del POS (S5): escribe el
    /// producto real de la tienda, en venta, con su descripción y su moneda.
    /// </summary>
    public sealed record CreateCatalogProductCommand(
        Guid CategoryId,
        string Name,
        decimal Price,
        int? Currency,
        string? Description,
        int? Order) : ICommand<CreatedCatalogProductDto>;

    public class CreateCatalogProductCommandHandler
        : ICommandHandler<CreateCatalogProductCommand, CreatedCatalogProductDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IProductRepository _productRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly ICatalogStaticPageRegenerator _catalogPageRegenerator;
        private readonly IStringLocalizer<I18n> _localizer;

        public CreateCatalogProductCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductCategoryRepository productCategoryRepository,
            IProductRepository productRepository,
            IStoreRepository storeRepository,
            ICatalogStaticPageRegenerator catalogPageRegenerator,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productCategoryRepository = productCategoryRepository;
            _productRepository = productRepository;
            _storeRepository = storeRepository;
            _catalogPageRegenerator = catalogPageRegenerator;
            _localizer = localizer;
        }

        public async Task<ResponseResult<CreatedCatalogProductDto>> Handle(
            CreateCatalogProductCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(
                    _localizer["StoreNotSelected", _httpContextService.UserExternalId],
                    HttpStatusCode.BadRequest);

            string name = request.Name?.Trim() ?? string.Empty;
            var errors = new List<Error>();
            if (name.Length == 0)
                errors.Add(new Error(nameof(request.Name), _localizer["IsRequired", nameof(request.Name)]));
            if (request.Price < 0)
                errors.Add(new Error(nameof(request.Price),
                    _localizer["GreaterThanOrEqualTo", nameof(request.Price), 0]));
            if (errors.Count > 0)
                throw new ValidationException { Errors = errors };

            // La categoría manda el producto a UNA tienda: una de otra tienda responde igual que
            // una inexistente (404 uniforme), antes de escribir nada.
            ProductCategory? category = await _productCategoryRepository.GetByIdAsync(request.CategoryId);
            if (category is null || category.StoreId != storeId)
                throw new ApiException(_localizer["ProductCategoryNotFound"], HttpStatusCode.NotFound);

            Store store = await _storeRepository.GetStoreByIdAsync(storeId)
                ?? throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

            // Mismo criterio que el import CSV: crear el primer producto publicable de una tienda
            // que nunca se sincronizó también deja listo su slug público. Sin él, el catálogo
            // público no existe y lo creado solo se vería en la vista admin (S6).
            if (string.IsNullOrWhiteSpace(store.CatalogSlug))
            {
                IReadOnlyCollection<string> takenStoreSlugs = await _storeRepository.GetCatalogSlugsAsync();
                store.CatalogSlug = SlugNormalizer.MakeUnique(
                    SlugNormalizer.Normalize(store.Name),
                    candidate => takenStoreSlugs.Contains(candidate));
                await _storeRepository.UpdateAsync(store);
            }

            IList<Product> siblings = await _productRepository.GetProductsByCategoryIdAsync(category.Id);
            int order = request.Order
                ?? (siblings.Count == 0 ? 1 : siblings.Max(product => product.Order) + 1);

            Product created = Product.Create(
                name,
                category.Id,
                request.Price,
                order,
                availableToSale: true,
                discountFromInventory: true,
                businessId: string.Empty,
                tenantId: _httpContextService.TenantId.ToGuid(),
                description: request.Description?.Trim() ?? string.Empty);
            // Moneda por VALOR del enum, igual que UpdateProductCatalogFieldsCommand (ausente o
            // fuera del enum = CUP).
            created.Currency = CatalogMirrorWriter.ToCurrency(request.Currency);

            await _productRepository.AddAsync(created);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            // Best-effort, igual que el import: si la página estática falla, lo guardado ya está y
            // el SPA sigue sirviendo el catálogo desde la base.
            await _catalogPageRegenerator.RegenerateAsync(storeId, cancellationToken);

            return ResponseResult.Success(new CreatedCatalogProductDto { Id = created.Id });
        }
    }
}
