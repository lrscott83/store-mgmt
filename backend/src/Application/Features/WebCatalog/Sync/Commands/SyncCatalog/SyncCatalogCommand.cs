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
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Sync.Commands.SyncCatalog
{
    /// <summary>
    /// Sincroniza el catálogo web de la tienda seleccionada (el botón "Sincronizar Catálogo").
    ///
    /// Publicación DIRECTA sobre las tablas normales (decisión del Owner, 2026-09-28): el catálogo
    /// público LEE `Product`/`ProductCategory`/`ProductImage` y NO existe una copia publicada.
    /// Sincronizar = traer los hechos del catálogo LOCAL del POS a esas tablas.
    ///
    /// Reglas:
    /// - Categorías primero, productos después; los ids son los del dispositivo, así que
    ///   re-sincronizar ACTUALIZA, nunca duplica.
    /// - Un producto/categoría que ya no está en el dispositivo se DESACTIVA (decisión D6):
    ///   la fila nunca se borra.
    /// - La galería se reemplaza solo cuando cambió; `images: null` = no tocarla.
    /// - Los campos que se editan en la vista Catálogo Web (descripción, descuentos, "Nuevo",
    ///   imagen principal) NO viajan en el snapshot y NO se tocan aquí (decisión D8).
    ///
    /// <paramref name="Snapshot"/> es el catálogo LOCAL del POS (plan §10.1): el POS es
    /// offline-first y el servidor no conoce sus productos, así que "Sincronizar" los envía.
    /// Sin snapshot (null) solo se asegura el slug/fecha: el catálogo ya vive en las tablas
    /// normales y lo que haya ahí es lo que se muestra.
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
        private readonly IStringLocalizer<I18n> _localizer;

        public SyncCatalogCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IDateTimeProvider dateTimeProvider,
            IStoreRepository storeRepository,
            IProductCategoryRepository productCategoryRepository,
            IProductRepository productRepository,
            IProductImageRepository productImageRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _dateTimeProvider = dateTimeProvider;
            _storeRepository = storeRepository;
            _productCategoryRepository = productCategoryRepository;
            _productRepository = productRepository;
            _productImageRepository = productImageRepository;
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

            int categoriesCreated = 0, categoriesUpdated = 0;
            int productsCreated = 0, productsUpdated = 0, productsDeactivated = 0;

            // Los slugs públicos de categoría se generan en la PRIMERA sincronización y no vuelven a
            // cambiar (las URLs se mantienen estables). Se rellenan SIEMPRE (con o sin snapshot) y
            // DENTRO de esta misma lectura — una segunda lectura chocaría con las entidades que el
            // espejo deja tracked (contexto sin tracking por defecto).
            //
            // La generación usa SOLO los slugs ya tomados (leídos una vez): nueva lectura por
            // categoría repetiría el mismo conflicto de tracking.
            IList<ProductCategory> allCategories;
            if (request.Snapshot is { } snapshot)
            {
                // El espejo trae los hechos del dispositivo a las tablas normales y devuelve los
                // conteos del resumen.
                CatalogMirrorCounts counts = await CatalogMirrorWriter.MirrorCatalogAsync(
                    snapshot, storeId, tenantId, _productCategoryRepository, _productRepository, _localizer);

                allCategories = CatalogMirrorWriter.CategoryResult;
                var takenSlugs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (ProductCategory category in allCategories)
                {
                    if (string.IsNullOrWhiteSpace(category.Slug))
                    {
                        // SIN UpdateAsync: para una categoría recién creada (todavía Added en el
                        // contexto) forzar Modified la convertiría en UPDATE antes del INSERT — y
                        // la fila aún no existe. Basta con asignar la propiedad: se va en el
                        // INSERT que este SaveChanges ya emite.
                        category.Slug = SlugNormalizer.MakeUnique(
                            SlugNormalizer.Normalize(category.Name),
                            candidate => takenSlugs.Contains(candidate));
                    }
                    takenSlugs.Add(category.Slug!);
                }

                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

                // La galería referencia filas de producto que tienen que existir primero: segundo
                // guardado.
                await CatalogMirrorWriter.MirrorGalleriesAsync(snapshot, storeId,
                    _productRepository, _productImageRepository);
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

                categoriesCreated = counts.CategoriesCreated;
                categoriesUpdated = counts.CategoriesUpdated;
                productsCreated = counts.ProductsCreated;
                productsUpdated = counts.ProductsUpdated;
                productsDeactivated = counts.ProductsDeactivated;
            }
            else
            {
                // Sin snapshot: las categorías que ya existían en el servidor (sin tracking) se
                // leen una vez y se genera el slug de las que no tengan.
                allCategories = await _productCategoryRepository.GetByStoreIdAsync(storeId);
                var takenSlugs = new HashSet<string>(
                    allCategories.Where(c => c.Slug != null).Select(c => c.Slug!),
                    StringComparer.OrdinalIgnoreCase);
                foreach (ProductCategory category in allCategories)
                {
                    if (string.IsNullOrWhiteSpace(category.Slug))
                    {
                        category.Slug = SlugNormalizer.MakeUnique(
                            SlugNormalizer.Normalize(category.Name),
                            candidate => takenSlugs.Contains(candidate));
                        await _productCategoryRepository.UpdateAsync(category);
                    }
                    takenSlugs.Add(category.Slug!);
                }
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


    }
}
