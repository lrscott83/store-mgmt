using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Sync;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
using Domain.Common.Extensions;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Entities.WebCatalog;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Sync.Commands.SyncCatalog
{
    /// <summary>
    /// Sincroniza el catálogo web de la tienda seleccionada (el botón "Sincronizar Catálogo").
    ///
    /// Reglas (plan 2026-09-27):
    /// - Categorías primero, productos después; la relación con el origen es 1:1 por SourceId, así
    ///   que re-sincronizar ACTUALIZA, nunca duplica.
    /// - Un producto/categoría del origen que ya no está en venta se DESPUBLICA (decisión D6):
    ///   la fila publicada nunca se borra.
    /// - La galería publicada sigue a la del origen y se reemplaza solo cuando cambia.
    ///
    /// <paramref name="Snapshot"/> es el catálogo LOCAL del POS (plan §10.1): el POS es
    /// offline-first y el servidor no conoce sus productos, así que "Sincronizar" los envía.
    /// Llega como espejo (hechos) antes de publicar, y respeta los campos de catálogo editados en
    /// la vista. Sin snapshot (null) se publica el origen que ya tenga el servidor, que es el
    /// comportamiento del módulo para las tiendas con datos propios en el backend.
    /// </summary>
    public sealed record SyncCatalogCommand(CatalogSnapshotDto? Snapshot = null) : ICommand<CatalogSyncSummaryDto>;

    public class SyncCatalogCommandHandler : ICommandHandler<SyncCatalogCommand, CatalogSyncSummaryDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IDateTimeProvider _dateTimeProvider;
        private readonly IStoreRepository _storeRepository;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IProductRepository _productRepository;
        private readonly IProductImageRepository _productImageRepository;
        private readonly ICatalogCategoryRepository _catalogCategoryRepository;
        private readonly ICatalogProductRepository _catalogProductRepository;
        private readonly ICatalogProductImageRepository _catalogProductImageRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public SyncCatalogCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IDateTimeProvider dateTimeProvider,
            IStoreRepository storeRepository,
            IProductCategoryRepository productCategoryRepository,
            IProductRepository productRepository,
            IProductImageRepository productImageRepository,
            ICatalogCategoryRepository catalogCategoryRepository,
            ICatalogProductRepository catalogProductRepository,
            ICatalogProductImageRepository catalogProductImageRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _dateTimeProvider = dateTimeProvider;
            _storeRepository = storeRepository;
            _productCategoryRepository = productCategoryRepository;
            _productRepository = productRepository;
            _productImageRepository = productImageRepository;
            _catalogCategoryRepository = catalogCategoryRepository;
            _catalogProductRepository = catalogProductRepository;
            _catalogProductImageRepository = catalogProductImageRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<CatalogSyncSummaryDto>> Handle(SyncCatalogCommand request, CancellationToken cancellationToken)
        {
            Guid tenantId = _httpContextService.TenantId.ToGuid();
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetStoreByIdAsync(storeId)
                ?? throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

            DateTime syncedAt = _dateTimeProvider.UtcNow.UtcDateTime;

            // El slug público se genera la primera vez y no vuelve a cambiar (decisión D4).
            if (string.IsNullOrWhiteSpace(store.CatalogSlug))
            {
                IReadOnlyCollection<string> takenSlugs = await _storeRepository.GetCatalogSlugsAsync();
                store.CatalogSlug = SlugNormalizer.MakeUnique(
                    SlugNormalizer.Normalize(store.Name),
                    candidate => takenSlugs.Contains(candidate));
            }

            store.CatalogSyncedAt = syncedAt;
            string storeSlug = store.CatalogSlug!;

            // Espejo del catálogo local ANTES de leer el origen: si el snapshot viene, es él quien
            // pone los hechos del producto en el servidor (y desactiva lo que ya no existe en el
            // dispositivo). Dos guardados porque la galería referencia filas de producto que tienen
            // que existir primero.
            //
            // Las categorías son las que DEVUELVE el espejo y no una lectura nueva: las que crea el
            // snapshot quedan tracked en el contexto (que trabaja sin tracking por defecto), así que
            // releerlas daría una segunda instancia con la misma clave y el `UpdateAsync` del slug
            // reventaría. Reusando la misma instancia no hay colisión.
            IList<ProductCategory> sourceCategories;
            if (request.Snapshot is { } snapshot)
            {
                sourceCategories = await CatalogMirrorWriter.MirrorCatalogAsync(snapshot, storeId, tenantId,
                    _productCategoryRepository, _productRepository, _localizer);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

                await CatalogMirrorWriter.MirrorGalleriesAsync(snapshot, storeId,
                    _productRepository, _productImageRepository);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);
            }
            else
            {
                sourceCategories = await _productCategoryRepository.GetByStoreIdAsync(storeId);
            }
            IList<Product> sourceProducts = await _productRepository.GetProductsForCatalogSyncAsync(storeId);
            IList<CatalogCategory> catalogCategories = await _catalogCategoryRepository.GetByStoreIdAsync(storeId);
            IList<CatalogProduct> catalogProducts = await _catalogProductRepository.GetByStoreIdAsync(storeId);

            int categoriesCreated = 0, categoriesUpdated = 0;
            int productsCreated = 0, productsUpdated = 0, productsDeactivated = 0;

            var takenCategorySlugs = new HashSet<string>(
                catalogCategories.Select(category => category.Slug)
                    .Concat(sourceCategories.Where(category => !string.IsNullOrWhiteSpace(category.Slug))
                        .Select(category => category.Slug!)),
                StringComparer.OrdinalIgnoreCase);

            var publishedCategoryIdBySource = new Dictionary<Guid, Guid>();

            foreach (ProductCategory source in sourceCategories)
            {
                string slug = await EnsureCategorySlugAsync(source, takenCategorySlugs, cancellationToken);
                takenCategorySlugs.Add(slug);

                CatalogCategory? published = catalogCategories.FirstOrDefault(category => category.SourceCategoryId == source.Id);
                if (published == null)
                {
                    published = CatalogCategory.Create(storeId, source.Id, source.Name, slug, source.Order, tenantId);
                    published.IsActive = source.IsActive;
                    published.SyncedAt = syncedAt;
                    await _catalogCategoryRepository.AddAsync(published);
                    categoriesCreated++;
                }
                else
                {
                    published.Name = source.Name;
                    published.Slug = slug;
                    published.Order = source.Order;
                    published.IsActive = source.IsActive;
                    published.SyncedAt = syncedAt;
                    await _catalogCategoryRepository.UpdateAsync(published);
                    categoriesUpdated++;
                }

                publishedCategoryIdBySource[source.Id] = published.Id;
            }

            // Categorías cuyo origen ya no existe: se despublican (nunca se borran).
            var sourceCategoryIds = sourceCategories.Select(category => category.Id).ToHashSet();
            foreach (CatalogCategory orphan in catalogCategories
                .Where(category => !sourceCategoryIds.Contains(category.SourceCategoryId) && category.IsActive))
            {
                orphan.IsActive = false;
                orphan.SyncedAt = syncedAt;
                await _catalogCategoryRepository.UpdateAsync(orphan);
                categoriesUpdated++;
            }

            var activeSourceCategoryIds = sourceCategories.Where(category => category.IsActive)
                .Select(category => category.Id).ToHashSet();
            var sourceProductIds = sourceProducts.Select(product => product.Id).ToHashSet();

            foreach (Product source in sourceProducts)
            {
                if (!publishedCategoryIdBySource.TryGetValue(source.CategoryId, out Guid catalogCategoryId))
                    continue;

                // D6: si el producto o su categoría dejaron de estar en venta, la copia se desactiva.
                bool shouldBePublished = source.IsActive && source.AvailableToSale
                    && activeSourceCategoryIds.Contains(source.CategoryId);

                CatalogProduct? published = catalogProducts.FirstOrDefault(product => product.SourceProductId == source.Id);
                if (published == null)
                {
                    published = CatalogProduct.Create(storeId, source.Id, catalogCategoryId, source.Name, tenantId);
                    ApplySource(published, source, catalogCategoryId, shouldBePublished, syncedAt);
                    await _catalogProductRepository.AddAsync(published);
                    productsCreated++;
                    await SyncGalleryAsync(published.Id, source, tenantId, null, cancellationToken);
                }
                else
                {
                    bool wasPublished = published.IsActive;
                    ApplySource(published, source, catalogCategoryId, shouldBePublished, syncedAt);
                    await _catalogProductRepository.UpdateAsync(published);
                    productsUpdated++;
                    if (wasPublished && !published.IsActive)
                        productsDeactivated++;

                    await SyncGalleryAsync(published.Id, source, tenantId, published.Images, cancellationToken);
                }
            }

            // Productos borrados en el origen: la copia publicada se desactiva (decisión D6).
            foreach (CatalogProduct orphan in catalogProducts
                .Where(product => !sourceProductIds.Contains(product.SourceProductId) && product.IsActive))
            {
                orphan.IsActive = false;
                orphan.SyncedAt = syncedAt;
                await _catalogProductRepository.UpdateAsync(orphan);
                productsDeactivated++;
            }

            await _storeRepository.UpdateAsync(store);
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(new CatalogSyncSummaryDto
            {
                StoreSlug = storeSlug,
                CatalogUrl = $"/catalog/{storeSlug}",
                SyncedAt = syncedAt,
                CategoriesCreated = categoriesCreated,
                CategoriesUpdated = categoriesUpdated,
                ProductsCreated = productsCreated,
                ProductsUpdated = productsUpdated,
                ProductsDeactivated = productsDeactivated,
            });
        }

        /// <summary>
        /// El slug publicado sale del slug del origen; si aún no tiene (categorías anteriores al
        /// módulo) se genera y se guarda en el origen para que las URLs se mantengan estables.
        /// </summary>
        private async Task<string> EnsureCategorySlugAsync(ProductCategory source, HashSet<string> takenSlugs,
            CancellationToken cancellationToken)
        {
            if (!string.IsNullOrWhiteSpace(source.Slug))
                return source.Slug!;

            string slug = SlugNormalizer.MakeUnique(
                SlugNormalizer.Normalize(source.Name),
                candidate => takenSlugs.Contains(candidate));

            source.Slug = slug;
            await _productCategoryRepository.UpdateAsync(source);
            return slug;
        }

        private static void ApplySource(CatalogProduct published, Product source, Guid catalogCategoryId,
            bool shouldBePublished, DateTime syncedAt)
        {
            published.CatalogCategoryId = catalogCategoryId;
            published.Name = source.Name;
            published.Description = source.Description ?? string.Empty;
            published.Price = source.Price;
            published.Currency = source.Currency;
            published.PercentDiscountPrice = source.PercentDiscountPrice;
            published.DiscountPrice = source.DiscountPrice;
            published.IsNew = source.IsNew;
            published.Image = source.Image;
            published.Order = source.Order;
            published.IsActive = shouldBePublished;
            published.SyncedAt = syncedAt;
        }

        /// <summary>
        /// Reemplaza la galería publicada solo cuando el origen cambió: no se copian binarios, ambas
        /// apuntan a la misma clave del almacenamiento.
        /// </summary>
        private async Task SyncGalleryAsync(Guid catalogProductId, Product source, Guid tenantId,
            ICollection<CatalogProductImage>? currentImages, CancellationToken cancellationToken)
        {
            List<string> sourcePaths = source.Images
                .Where(image => image.IsActive)
                .OrderBy(image => image.Order).ThenBy(image => image.CreatedDate)
                .Select(image => image.Path)
                .ToList();

            List<string> publishedPaths = (currentImages ?? new List<CatalogProductImage>())
                .OrderBy(image => image.Order)
                .Select(image => image.Path)
                .ToList();

            if (sourcePaths.SequenceEqual(publishedPaths))
                return;

            await _catalogProductImageRepository.HardDeleteWhereAsync(image => image.CatalogProductId == catalogProductId);

            if (sourcePaths.Count == 0)
                return;

            IEnumerable<CatalogProductImage> rows = sourcePaths
                .Select((path, index) => CatalogProductImage.Create(catalogProductId, path, index, tenantId));

            await _catalogProductImageRepository.AddRangeAsync(rows);
        }
    }
}
