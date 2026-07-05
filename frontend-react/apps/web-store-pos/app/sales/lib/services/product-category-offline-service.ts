import type { ProductCategory, ProductCategoryService, ProductCategoryView } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { ProductOfflineService } from './product-offline-service';

const repo = new BaseRepository<ProductCategory>('product-categories');

function generateId(): string {
  return crypto.randomUUID();
}

export class ProductCategoryOfflineService implements ProductCategoryService {
  constructor(private readonly storeId: string) {}

  getAll(): ProductCategory[] {
    // Angular parity (parity fix, not a bug): ProductCategoryRepository.getProductCategories()
    // sorts ascending by order — this was previously Map-insertion order.
    return Array.from(repo.getAll(this.storeId).values()).sort((a, b) => a.order - b.order);
  }

  getById(id: string): ProductCategory | undefined {
    return repo.getById(this.storeId, id);
  }

  getByName(name: string): ProductCategory | undefined {
    return this.getAll().find((c) => c.name === name);
  }

  save(category: ProductCategory): ProductCategory {
    repo.upsert(this.storeId, category);
    return category;
  }

  delete(id: string): void {
    repo.remove(this.storeId, id);
  }

  addByName(name: string): string {
    const id = generateId();
    const categories = this.getAll();
    const nextOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.order)) + 1 : 1;
    const newCategory: ProductCategory = {
      id,
      name,
      order: nextOrder,
      isActive: true,
    };
    repo.upsert(this.storeId, newCategory);
    return id;
  }

  hasAnyCategory(): boolean {
    return this.getAll().length > 0;
  }

  hasAnyAvailableCategory(): boolean {
    return this.getAll().some((c) => c.isActive);
  }

  getMaxOrder(): number {
    // GLOBAL max across ALL categories (store-wide scope) — distinct from
    // ProductService.getMaxOrder(categoryId), which is per-category. Do not unify.
    const categories = this.getAll();
    return categories.length > 0 ? Math.max(...categories.map((c) => c.order)) : 0;
  }

  getAvailableProductCategories(): ProductCategory[] {
    return this.getAll().filter((c) => c.isActive);
  }

  getProductCategoriesView(): ProductCategoryView[] {
    // Single-pass composition (ADR-3): instantiate ProductOfflineService for this
    // store, call getAll() ONCE, build a categoryId -> count map using the
    // STRICTER isActive && availableToSale predicate (NOT the isActive-only
    // predicate used by getAvailableProductsByCategoryId). O(P+C), no N+1.
    const productService = new ProductOfflineService(this.storeId);
    const counts = new Map<string, number>();
    for (const product of productService.getAll()) {
      if (product.isActive && product.availableToSale) {
        counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
      }
    }
    return this.getAvailableProductCategories().map((category) => ({
      id: category.id,
      name: category.name,
      order: category.order,
      isActive: category.isActive,
      productsCount: counts.get(category.id) ?? 0,
    }));
  }
}
