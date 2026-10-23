using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Public;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Results;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Import.Commands.ImportCatalogCsv
{
    /// <summary>
    /// Importa productos al catálogo web de la tienda del contexto (SuperAdmin, store-scoped) desde
    /// filas CSV ya normalizadas por el navegador: categoría, producto, precio de venta y moneda.
    ///
    /// UPSERT por (categoría + producto), nombres comparados sin distinguir mayúsculas: crea lo que
    /// falta y, en lo existente, actualiza SOLO precio y moneda (decisión del owner, 2026-10-22).
    /// Los productos nuevos nacen activos y en venta para que el catálogo público los publique.
    ///
    /// Los slugs de tienda y categoría se generan aquí con el MISMO normalizador que la
    /// sincronización: el catálogo público solo lista categorías con slug, así que omitirlos dejaría
    /// el import invisible.
    /// </summary>
    public sealed record ImportCatalogCsvCommand(IReadOnlyList<CatalogCsvRowDto> Rows)
        : ICommand<CatalogCsvImportSummaryDto>;

    public class ImportCatalogCsvCommandHandler
        : ICommandHandler<ImportCatalogCsvCommand, CatalogCsvImportSummaryDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreRepository _storeRepository;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IProductRepository _productRepository;
        private readonly ICatalogStaticPageRegenerator _catalogPageRegenerator;
        private readonly IStringLocalizer<I18n> _localizer;

        public ImportCatalogCsvCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreRepository storeRepository,
            IProductCategoryRepository productCategoryRepository,
            IProductRepository productRepository,
            ICatalogStaticPageRegenerator catalogPageRegenerator,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
            _productCategoryRepository = productCategoryRepository;
            _productRepository = productRepository;
            _catalogPageRegenerator = catalogPageRegenerator;
            _localizer = localizer;
        }

        public async Task<ResponseResult<CatalogCsvImportSummaryDto>> Handle(
            ImportCatalogCsvCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(
                    _localizer["StoreNotSelected", _httpContextService.UserExternalId],
                    HttpStatusCode.BadRequest);

            // Todo o nada (S7): una sola fila inválida aborta el import ANTES de escribir nada. El
            // índice que se reporta es el 1-based de la fila de datos, el mismo que ve el dueño del
            // CSV en una hoja de cálculo (sin contar el encabezado, que se explica en la UI).
            ValidateRows(request.Rows);

            Store store = await _storeRepository.GetStoreByIdAsync(storeId)
                ?? throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

            Guid tenantId = _httpContextService.TenantId.ToGuid();

            // El slug público de la tienda se genera la primera vez y no cambia (misma regla que la
            // sincronización): sin él, el catálogo no tiene URL pública.
            if (string.IsNullOrWhiteSpace(store.CatalogSlug))
            {
                IReadOnlyCollection<string> takenStoreSlugs = await _storeRepository.GetCatalogSlugsAsync();
                store.CatalogSlug = SlugNormalizer.MakeUnique(
                    SlugNormalizer.Normalize(store.Name),
                    candidate => takenStoreSlugs.Contains(candidate));
            }

            IList<ProductCategory> categories = await _productCategoryRepository.GetByStoreIdAsync(storeId);
            var categoriesByName = new Dictionary<string, ProductCategory>(StringComparer.OrdinalIgnoreCase);
            foreach (ProductCategory category in categories)
                categoriesByName.TryAdd(category.Name.Trim(), category);

            var takenCategorySlugs = new HashSet<string>(
                categories.Where(c => !string.IsNullOrWhiteSpace(c.Slug)).Select(c => c.Slug!),
                StringComparer.OrdinalIgnoreCase);

            IList<Product> products = await _productRepository.GetProductsForCatalogSyncAsync(storeId);
            var productsByCategory = products
                .GroupBy(product => product.CategoryId)
                .ToDictionary(group => group.Key, group => group.ToList());

            int maxCategoryOrder = categories.Count == 0 ? 0 : categories.Max(category => category.Order);
            int categoriesCreated = 0, productsCreated = 0, productsUpdated = 0;

            foreach (CatalogCsvRowDto row in request.Rows)
            {
                string categoryName = row.CategoryName.Trim();
                string productName = row.ProductName.Trim();
                Currency currency = ResolveCurrency(row.Currency);

                if (!categoriesByName.TryGetValue(categoryName, out ProductCategory? category))
                {
                    category = ProductCategory.Create(storeId, categoryName, ++maxCategoryOrder, tenantId);
                    category.Slug = SlugNormalizer.MakeUnique(
                        SlugNormalizer.Normalize(categoryName),
                        candidate => takenCategorySlugs.Contains(candidate));
                    takenCategorySlugs.Add(category.Slug!);

                    await _productCategoryRepository.AddAsync(category);
                    categoriesByName[categoryName] = category;
                    productsByCategory[category.Id] = new List<Product>();
                    categoriesCreated++;
                }
                else if (string.IsNullOrWhiteSpace(category.Slug))
                {
                    // Categoría existente que nunca se publicó: sin slug el catálogo público la
                    // filtra fuera, así que el import la deja publicable en la misma pasada.
                    category.Slug = SlugNormalizer.MakeUnique(
                        SlugNormalizer.Normalize(category.Name),
                        candidate => takenCategorySlugs.Contains(candidate));
                    takenCategorySlugs.Add(category.Slug);
                    await _productCategoryRepository.UpdateAsync(category);
                }

                List<Product> categoryProducts = productsByCategory[category.Id];
                Product? existing = categoryProducts.FirstOrDefault(product =>
                    string.Equals(product.Name.Trim(), productName, StringComparison.OrdinalIgnoreCase));

                if (existing is null)
                {
                    int order = categoryProducts.Count == 0 ? 1 : categoryProducts.Max(product => product.Order) + 1;
                    Product product = Product.Create(
                        productName, category.Id, row.Price, order,
                        availableToSale: true,
                        discountFromInventory: true,
                        businessId: string.Empty,
                        tenantId: tenantId);
                    product.Currency = currency;

                    await _productRepository.AddAsync(product);
                    categoryProducts.Add(product);
                    productsCreated++;
                }
                else
                {
                    // Solo precio y moneda (decisión del owner): nombre, disponibilidad, descuentos,
                    // imagen y galería se editan en la vista, no se pisan desde un CSV.
                    existing.Price = row.Price;
                    existing.Currency = currency;
                    await _productRepository.UpdateAsync(existing);
                    productsUpdated++;
                }
            }

            await _storeRepository.UpdateAsync(store);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            // Best-effort, igual que la sync: si la página estática falla, lo guardado ya está y el
            // SPA sigue sirviendo el catálogo desde la base.
            await _catalogPageRegenerator.RegenerateAsync(storeId, cancellationToken);

            return ResponseResult.Success(new CatalogCsvImportSummaryDto(
                categoriesCreated, productsCreated, productsUpdated, request.Rows.Count));
        }

        private void ValidateRows(IReadOnlyList<CatalogCsvRowDto> rows)
        {
            if (rows.Count == 0)
            {
                throw new ValidationException
                {
                    Errors = [new Error("Rows", _localizer["CatalogCsvInvalidRow", 0])]
                };
            }

            for (int index = 0; index < rows.Count; index++)
            {
                CatalogCsvRowDto row = rows[index];
                bool invalid = string.IsNullOrWhiteSpace(row.CategoryName)
                    || string.IsNullOrWhiteSpace(row.ProductName)
                    || row.Price < 0
                    || (row.Currency.HasValue && !Enum.IsDefined(row.Currency.Value));

                if (invalid)
                {
                    throw new ValidationException
                    {
                        Errors = [new Error($"Rows[{index + 1}]", _localizer["CatalogCsvInvalidRow", index + 1])]
                    };
                }
            }
        }

        private static Currency ResolveCurrency(Currency? currency)
            => currency.HasValue && Enum.IsDefined(currency.Value) ? currency.Value : Currency.CUP;
    }
}
