using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
using Domain.Common.Extensions;
using Domain.Common.Results;
using Domain.Entities.ProductCategories;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Admin.Commands.CreateCatalogCategory
{
    /// <summary>
    /// Alta de una categoría del catálogo desde la vista SuperAdmin, sobre la MISMA tabla
    /// `ProductCategory` que ya usa el catálogo (sin copias ni tablas nuevas). El orden explícito
    /// es opcional: sin él la categoría va al final de la tienda.
    /// </summary>
    public sealed record CreateCatalogCategoryCommand(string Name, int? Order) : ICommand<CatalogCategoryDto>;

    public class CreateCatalogCategoryCommandHandler
        : ICommandHandler<CreateCatalogCategoryCommand, CatalogCategoryDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public CreateCatalogCategoryCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductCategoryRepository productCategoryRepository,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productCategoryRepository = productCategoryRepository;
            _storeRepository = storeRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<CatalogCategoryDto>> Handle(
            CreateCatalogCategoryCommand request, CancellationToken cancellationToken)
        {
            // La tienda sale del contexto de la petición (la publica AdminStoreScope desde la ruta);
            // sin ella no hay dónde crear y se avisa antes de tocar la base.
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(
                    _localizer["StoreNotSelected", _httpContextService.UserExternalId],
                    HttpStatusCode.BadRequest);

            if (await _storeRepository.GetStoreByIdAsync(storeId) is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

            string name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0)
                throw new ValidationException
                {
                    Errors = [new Error(nameof(request.Name), _localizer["IsRequired", nameof(request.Name)])]
                };

            // Una sola lectura de la tienda resuelve las TRES reglas del alta (nombre repetido,
            // slug libre y orden final) sobre el mismo estado, y nunca usa el validador global del
            // dueño: allí la unicidad es entre todas las tiendas y aquí es por tienda.
            IList<ProductCategory> categories = await _productCategoryRepository.GetByStoreIdAsync(storeId);

            bool duplicated = categories.Any(category =>
                string.Equals(category.Name.Trim(), name, StringComparison.OrdinalIgnoreCase));
            if (duplicated)
                throw new ApiException(
                    _localizer["ProductCategoryAlreadyExists", name], HttpStatusCode.Conflict);

            // Mismo normalizador y misma noción de colisión que el catálogo (y que el import CSV).
            var takenSlugs = new HashSet<string>(
                categories.Where(category => !string.IsNullOrWhiteSpace(category.Slug))
                    .Select(category => category.Slug!),
                StringComparer.OrdinalIgnoreCase);
            string slug = SlugNormalizer.MakeUnique(
                SlugNormalizer.Normalize(name), candidate => takenSlugs.Contains(candidate));

            int order = request.Order
                ?? (categories.Count == 0 ? 1 : categories.Max(category => category.Order) + 1);

            ProductCategory created = ProductCategory.Create(
                storeId, name, order, _httpContextService.TenantId.ToGuid(), slug);
            await _productCategoryRepository.AddAsync(created);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(new CatalogCategoryDto
            {
                Id = created.Id,
                Name = created.Name,
                Order = created.Order,
            });
        }
    }
}
