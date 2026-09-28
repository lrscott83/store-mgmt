using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Domain.Common.Enums;
using Domain.Common.Limits;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Sync
{
    /// <summary>
    /// Escribe el catálogo LOCAL del POS en las tablas de origen del servidor (espejo).
    ///
    /// Por qué existe (plan 2026-09-27 §10.1): el POS es offline-first (`USE_ONLINE_SERVICE:false`),
    /// así que los productos viven en el dispositivo y la tabla `Product` del servidor está vacía
    /// para una tienda nueva: sin este paso, "Sincronizar Catálogo" publicaría un catálogo vacío.
    ///
    /// Reglas:
    /// - Los ids son los del dispositivo: el espejo respeta el Guid del snapshot para que la copia
    ///   publicada siga siendo 1:1 con el origen (y una re-sincronización sea idempotente).
    /// - Solo se escriben HECHOS (nombre, precio, categoría, orden, disponibilidad, moneda, galería).
    ///   Los campos que se editan en la vista Catálogo Web (descripción, descuentos, "Nuevo" e
    ///   imagen principal) se quedan como están (decisión D8): el snapshot no los trae y el espejo
    ///   nunca los pisa.
    /// - Lo que ya no está en el dispositivo se marca INACTIVO (decisión D6: despublicar, nunca
    ///   borrar); la copia publicada se desactiva en el paso de sincronización.
    /// </summary>
    internal static class CatalogMirrorWriter
    {
        /// <summary>Tope de filas que un snapshot puede traer: una tienda real no se acerca.</summary>
        public const int MaxCategories = 500;
        public const int MaxProducts = 5000;

        /// <summary>
        /// Primera fase: categorías y productos (hechos). El llamador guarda al terminar.
        ///
        /// Devuelve las categorías del origen tal como quedaron (las que ya existían más las que
        /// crea el snapshot), porque las creadas aquí quedan TRACKED en el contexto y el
        /// `ApplicationDbContext` trabaja con `QueryTrackingBehavior.NoTracking`: si la
        /// sincronización volviera a leerlas de la base, tendría una segunda instancia con la misma
        /// clave y fallaría al attacharla ("another instance with the same key value is already
        /// being tracked"). Devolviéndolas se reusa la MISMA instancia y no hay colisión.
        /// </summary>
        public static async Task<IList<ProductCategory>> MirrorCatalogAsync(
            CatalogSnapshotDto snapshot,
            Guid storeId,
            Guid tenantId,
            IProductCategoryRepository categoryRepository,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            IList<ProductCategory> storedCategories = await categoryRepository.GetByStoreIdAsync(storeId);
            var storedCategoriesById = storedCategories.ToDictionary(category => category.Id);
            var snapshotCategoryIds = snapshot.Categories.Select(category => category.Id).ToHashSet();
            var createdCategories = new List<ProductCategory>();

            foreach (CatalogSnapshotCategoryDto incoming in snapshot.Categories)
            {
                if (storedCategoriesById.TryGetValue(incoming.Id, out ProductCategory? category))
                {
                    // El slug (componente de la URL pública) no se re-deriva aquí: si el nombre
                    // cambió, la sincronización lo recalcula y conserva el que ya existe.
                    category.Name = incoming.Name;
                    category.Order = incoming.Order;
                    category.IsActive = incoming.IsActive;
                    await categoryRepository.UpdateAsync(category);
                }
                else
                {
                    await EnsureIdIsFreeAsync(categoryRepository.Where(other => other.Id == incoming.Id).Any(),
                        incoming.Id, "ProductCategory", localizer);
                    var created = ProductCategory.Create(incoming.Id, storeId, incoming.Name, incoming.Order, tenantId);
                    await categoryRepository.AddAsync(created);
                    createdCategories.Add(created);
                }
            }

            // Categorías que ya no están en el dispositivo: inactivas (nunca borradas).
            foreach (ProductCategory orphan in storedCategories
                .Where(category => !snapshotCategoryIds.Contains(category.Id) && category.IsActive))
            {
                orphan.IsActive = false;
                await categoryRepository.UpdateAsync(orphan);
            }

            IList<Product> storedProducts = await productRepository.GetProductsForCatalogSyncAsync(storeId);
            var storedProductsById = storedProducts.ToDictionary(product => product.Id);
            var snapshotProductIds = snapshot.Products.Select(product => product.Id).ToHashSet();

            foreach (CatalogSnapshotProductDto incoming in snapshot.Products)
            {
                if (storedProductsById.TryGetValue(incoming.Id, out Product? product))
                {
                    product.Name = incoming.Name;
                    product.CategoryId = incoming.CategoryId;
                    product.Price = incoming.Price;
                    product.Currency = ToCurrency(incoming.Currency);
                    product.Order = incoming.Order;
                    product.AvailableToSale = incoming.AvailableToSale;
                    product.IsActive = incoming.IsActive;
                    product.DiscountFromInventory = incoming.DiscountFromInventory;
                    if (!string.IsNullOrWhiteSpace(incoming.BusinessId))
                        product.BusinessId = incoming.BusinessId!;
                    // Description / PercentDiscountPrice / DiscountPrice / IsNew / Image: NO se tocan.
                    await productRepository.UpdateAsync(product);
                }
                else
                {
                    await EnsureIdIsFreeAsync(productRepository.Where(other => other.Id == incoming.Id).Any(),
                        incoming.Id, "Product", localizer);
                    Product created = Product.Create(incoming.Id, incoming.Name, incoming.CategoryId, incoming.Price,
                        incoming.Order, incoming.AvailableToSale, incoming.DiscountFromInventory,
                        incoming.BusinessId ?? string.Empty, tenantId);
                    created.Currency = ToCurrency(incoming.Currency);
                    await productRepository.AddAsync(created);
                }
            }

            // Productos que ya no están en el dispositivo: inactivos y fuera de venta.
            foreach (Product orphan in storedProducts
                .Where(product => !snapshotProductIds.Contains(product.Id) && (product.IsActive || product.AvailableToSale)))
            {
                orphan.IsActive = false;
                orphan.AvailableToSale = false;
                await productRepository.UpdateAsync(orphan);
            }

            // Mismo orden que `GetByStoreIdAsync` (orden, luego nombre) para que publicar sea estable.
            return storedCategories.Concat(createdCategories)
                .OrderBy(category => category.Order).ThenBy(category => category.Name)
                .ToList();
        }

        /// <summary>
        /// Segunda fase: galerías. Va aparte porque las filas de producto tienen que existir antes
        /// (la galería referencia al producto), así que el llamador guarda entre las dos fases.
        /// </summary>
        public static async Task MirrorGalleriesAsync(
            CatalogSnapshotDto snapshot,
            Guid storeId,
            IProductRepository productRepository,
            IProductImageRepository imageRepository)
        {
            IList<Product> storedProducts = await productRepository.GetProductsForCatalogSyncAsync(storeId);
            var storedProductsById = storedProducts.ToDictionary(product => product.Id);

            foreach (CatalogSnapshotProductDto incoming in snapshot.Products)
            {
                if (!storedProductsById.TryGetValue(incoming.Id, out Product? product))
                    continue;

                // null = el POS no conoce la galería (sus fotos se suben desde la vista Catálogo
                // Web): no se toca. Lista vacía = sin imágenes.
                if (incoming.Images == null)
                    continue;

                List<string> desiredPaths = incoming.Images.Where(path => !string.IsNullOrWhiteSpace(path)).ToList();
                List<string> storedPaths = product.Images
                    .OrderBy(image => image.Order).ThenBy(image => image.CreatedDate)
                    .Select(image => image.Path)
                    .ToList();

                // Solo se reescribe cuando cambió: re-sincronizar no reescribe la galería entera.
                if (desiredPaths.SequenceEqual(storedPaths))
                    continue;

                await imageRepository.HardDeleteWhereAsync(image => image.ProductId == product.Id);

                if (desiredPaths.Count == 0)
                    continue;

                IEnumerable<ProductImage> rows = desiredPaths
                    .Select((path, index) => ProductImage.Create(product.Id, path, index, product.TenantId));

                await imageRepository.AddRangeAsync(rows);
            }
        }

        /// <summary>Moneda del snapshot/respuesta por VALOR del enum; un valor raro cae a CUP.</summary>
        public static Currency ToCurrency(int? value)
        {
            if (!value.HasValue)
                return Currency.CUP;

            return Enum.IsDefined(typeof(Currency), value.Value) ? (Currency)value.Value : Currency.CUP;
        }

        /// <summary>
        /// Un id que ya existe en OTRA tienda no se puede recrear (la clave primaria es global): es
        /// un snapshot inválido y se rechaza en vez de reventar con un error de base de datos.
        /// </summary>
        private static Task EnsureIdIsFreeAsync(bool alreadyExists, Guid id, string entity, IStringLocalizer<I18n> localizer)
        {
            if (alreadyExists)
                throw new ApiException(
                    localizer["CatalogSnapshotIdConflict", entity, id.ToString()], HttpStatusCode.BadRequest);

            return Task.CompletedTask;
        }
    }
}
