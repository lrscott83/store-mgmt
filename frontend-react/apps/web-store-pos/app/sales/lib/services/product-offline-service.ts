import type { Product } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';

const repo = new BaseRepository<Product>('products', ['createdDate', 'updatedDate']);

function generateId(): string {
  return crypto.randomUUID();
}

export class ProductOfflineService {
  constructor(private readonly storeId: string) {}

  getAll(): Product[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getById(id: string): Product | undefined {
    return repo.getById(this.storeId, id);
  }

  getByBarcode(barcode: string): Product | undefined {
    if (!barcode) return undefined;
    return this.getAll().find((p) => p.barcode === barcode);
  }

  create(data: Omit<Product, 'id'> & { id?: string }): Product {
    const product: Product = {
      ...data,
      id: data.id ?? generateId(),
    };
    repo.upsert(this.storeId, product);
    return product;
  }

  update(product: Product): Product {
    repo.upsert(this.storeId, product);
    return product;
  }

  updateMany(products: Product[]): void {
    const all = repo.getAll(this.storeId);
    for (const product of products) {
      all.set(product.id, product);
    }
    repo.save(this.storeId, all);
  }

  delete(id: string): void {
    repo.remove(this.storeId, id);
  }

  search(query: string): Product[] {
    const all = this.getAll().filter((p) => p.isActive);
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.categoryName?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q),
    );
  }
}
