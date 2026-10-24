import { DEFAULT_CURRENCY } from '@store-mgmt/domain';
import { parseCurrencyByName } from '../csv-product-parser';
import type { ProductRepository } from '../repositories/product-repository';
import type { ProductCategoryRepository } from '../repositories/product-category-repository';
import type { CatalogProductView } from '../services/catalog-http-service';

/**
 * Solo lo que la importación necesita de cada repositorio. Declararlo así mantiene el importador
 * puro y comprobable sin tocar IndexedDB, y obliga a que cualquier repositorio real que se le pase
 * ofrezca exactamente estas primitivas.
 */
export type CatalogImportCategoryRepository = Pick<
  ProductCategoryRepository,
  'getProductCategoryById' | 'addImportedProductCategory'
>;

export type CatalogImportProductRepository = Pick<
  ProductRepository,
  'getProductById' | 'addProductData'
>;

export interface CatalogImportDependencies {
  categoryRepository: CatalogImportCategoryRepository;
  productRepository: CatalogImportProductRepository;
}

/** Categoría que el repositorio rechazó: sus productos NO se importaron. */
export interface CatalogImportFailedCategory {
  id: string;
  name: string;
  skippedProductsCount: number;
}

/** Producto que el repositorio rechazó (p. ej. nombre repetido dentro de la categoría). */
export interface CatalogImportFailedProduct {
  id: string;
  name: string;
}

/**
 * Resultado de la importación Catálogo Web → POS. `existingCount` son los productos cuyo `id` ya
 * estaba en el POS y que no se tocaron; todo lo demás que no se pudo insertar va en las listas de
 * fallos para que la vista lo muestre tal cual.
 */
export interface CatalogImportSummary {
  importedCount: number;
  existingCount: number;
  failedCategories: CatalogImportFailedCategory[];
  failedProducts: CatalogImportFailedProduct[];
}

/**
 * Importa al catálogo LOCAL del POS los productos del catálogo web (plan web-catalog-to-pos-import).
 *
 * La identidad es el `id` y SOLO el `id` (S2/S3): un producto que ya existe se omite sin tocar
 * nada, y una categoría que ya existe se reutiliza. De los productos se copian únicamente
 * categoría, nombre, precio, moneda y orden (S4/S5); el resto de campos toma los mismos valores
 * que el alta normal (`businessId: ''`, activo, disponible para vender, descuenta de inventario).
 *
 * El repositorio sigue siendo la autoridad: si rechaza una categoría (por ejemplo, nombre
 * duplicado) sus productos NO se importan y se reportan; si rechaza un producto, ese producto se
 * reporta como fallo. Nunca se esquiva esa validación.
 */
export function importCatalogProducts(
  catalogProducts: CatalogProductView[],
  dependencies: CatalogImportDependencies,
): CatalogImportSummary {
  const { categoryRepository, productRepository } = dependencies;

  const failedCategories = new Map<string, CatalogImportFailedCategory>();
  const failedProducts: CatalogImportFailedProduct[] = [];
  const resolvedCategoryIds = new Set<string>();
  let importedCount = 0;
  let existingCount = 0;

  for (const catalogProduct of catalogProducts) {
    // Id ya presente en el POS: se omite en silencio, sin tocar el producto ni su categoría.
    if (productRepository.getProductById(catalogProduct.id)) {
      existingCount += 1;
      continue;
    }

    const failedCategory = failedCategories.get(catalogProduct.categoryId);
    if (failedCategory) {
      failedCategory.skippedProductsCount += 1;
      continue;
    }

    if (!resolvedCategoryIds.has(catalogProduct.categoryId)) {
      const existingCategory = categoryRepository.getProductCategoryById(catalogProduct.categoryId);
      if (existingCategory) {
        resolvedCategoryIds.add(catalogProduct.categoryId);
      } else {
        const created = categoryRepository.addImportedProductCategory({
          id: catalogProduct.categoryId,
          name: catalogProduct.categoryName,
          // El orden de la categoría viaja aparte porque el del producto es el de la fila.
          order: catalogProduct.categoryOrder ?? 0,
          isActive: true,
        });
        if (!created.succeeded) {
          failedCategories.set(catalogProduct.categoryId, {
            id: catalogProduct.categoryId,
            name: catalogProduct.categoryName,
            skippedProductsCount: 1,
          });
          continue;
        }
        resolvedCategoryIds.add(catalogProduct.categoryId);
      }
    }

    const created = productRepository.addProductData(
      catalogProduct.id,
      catalogProduct.categoryId,
      catalogProduct.name,
      catalogProduct.price,
      '',
      catalogProduct.order,
      true,
      true,
      true,
      undefined,
      undefined,
      parseCurrencyByName(catalogProduct.currency) ?? DEFAULT_CURRENCY,
    );
    if (!created.succeeded) {
      failedProducts.push({ id: catalogProduct.id, name: catalogProduct.name });
      continue;
    }
    importedCount += 1;
  }

  return {
    importedCount,
    existingCount,
    failedCategories: [...failedCategories.values()],
    failedProducts,
  };
}
