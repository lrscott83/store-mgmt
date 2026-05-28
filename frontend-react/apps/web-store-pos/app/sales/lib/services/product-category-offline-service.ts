import type { ProductCategory } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';

const repo = new BaseRepository<ProductCategory>('product-categories');

function generateId(): string {
  return crypto.randomUUID();
}

export class ProductCategoryOfflineService {
  constructor(private readonly storeId: string) {}

  getAll(): ProductCategory[] {
    return Array.from(repo.getAll(this.storeId).values());
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
}
