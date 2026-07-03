import type { Product } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';

const repo = new BaseRepository<Product>('products', ['createdDate', 'updatedDate']);

function generateId(): string {
  return crypto.randomUUID();
}

type CreateProductInput = Omit<
  Product,
  'id' | 'createdDate' | 'createdByName' | 'updatedDate' | 'updatedByName'
> & { id?: string };

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

  create(data: CreateProductInput): Product {
    const product: Product = {
      ...data,
      id: data.id ?? generateId(),
      createdDate: new Date(),
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };
    repo.upsert(this.storeId, product);
    return product;
  }

  update(product: Product): Product {
    const updated: Product = {
      ...product,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  updateMany(products: Product[]): void {
    const now = new Date();
    const login = getCurrentUserLogin();
    const all = repo.getAll(this.storeId);
    for (const product of products) {
      all.set(product.id, { ...product, updatedDate: now, updatedByName: login });
    }
    repo.save(this.storeId, all);
  }

  delete(id: string): void {
    // Angular parity (ADR-3): deleteProduct soft-deletes — sets isActive=false,
    // updatedDate/updatedByName, keeps the record (audit trail, sync contract).
    // No-op for a missing id, matching the prior hard-delete's no-op behavior.
    const existing = repo.getById(this.storeId, id);
    if (!existing) return;
    repo.upsert(this.storeId, {
      ...existing,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    });
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
