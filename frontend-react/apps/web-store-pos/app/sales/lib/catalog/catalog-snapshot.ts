import type { Product } from '@store-mgmt/domain';
import type {
  CatalogSnapshot,
  CatalogSnapshotProduct,
} from '../services/catalog-http-service';
import { ProductCategoryRepository } from '../repositories/product-category-repository';
import { ProductRepository } from '../repositories/product-repository';

/**
 * Arma la foto del catálogo LOCAL del POS que viaja en "Sincronizar Catálogo" (plan 2026-09-27 §10.1).
 *
 * El POS es offline-first (`GlobalConfig.USE_ONLINE_SERVICE:false`), así que los productos viven en
 * el dispositivo y el servidor solo los conoce cuando se los enviamos: sin este snapshot, sincronizar
 * publicaría un catálogo vacío. Los repositorios son la misma fuente que usa el resto del POS, así
 * que se leen con el `storeId` de la tienda seleccionada (y con su descifrado de siempre).
 *
 * Se envía TODO el catálogo almacenado, no solo lo que está en venta: el backend necesita saber qué
 * sigue existiendo en el dispositivo para despublicar lo demás sin borrarlo (decisión D6). La
 * galería no viaja (el POS no la tiene: las fotos se suben desde la vista Catálogo Web).
 */
export function buildCatalogSnapshot(storeId: string): CatalogSnapshot {
  const categoryRepository = new ProductCategoryRepository(storeId);
  const productRepository = new ProductRepository(storeId, categoryRepository);

  return {
    categories: categoryRepository.getProductCategories().map((category) => ({
      id: category.id,
      name: category.name,
      order: category.order,
      isActive: category.isActive,
    })),
    products: [...productRepository.getStorageProductsMap().values()].map(toSnapshotProduct),
  };
}

/**
 * Hechos del producto que el POS es dueño. `currency` y `businessId` solo se envían cuando existen:
 * ausentes, el backend conserva el valor que ya tenga (moneda CUP por defecto).
 */
function toSnapshotProduct(product: Product): CatalogSnapshotProduct {
  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    price: product.price,
    ...(product.currency !== undefined ? { currency: product.currency } : {}),
    order: product.order,
    availableToSale: product.availableToSale,
    isActive: product.isActive,
    ...(product.businessId ? { businessId: product.businessId } : {}),
    discountFromInventory: product.discountFromInvantory,
  };
}
