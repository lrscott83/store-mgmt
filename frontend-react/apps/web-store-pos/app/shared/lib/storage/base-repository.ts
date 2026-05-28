import { StorageKeys } from './storage-keys';

export class BaseRepository<T extends { id: string }> {
  private readonly entityKey: string;
  private readonly dateFields: string[];

  constructor(entityKey: string, dateFields: string[] = []) {
    this.entityKey = entityKey;
    this.dateFields = dateFields;
  }

  private getStorageKey(storeId: string): string {
    return StorageKeys.entityKey(this.entityKey, storeId);
  }

  private reviveDates(item: T): T {
    if (this.dateFields.length === 0) return item;
    const revived = { ...item } as Record<string, unknown>;
    for (const field of this.dateFields) {
      const value = revived[field];
      if (typeof value === 'string') {
        revived[field] = new Date(value);
      }
    }
    return revived as T;
  }

  getAll(storeId: string): Map<string, T> {
    const raw = localStorage.getItem(this.getStorageKey(storeId));
    if (!raw) return new Map<string, T>();
    try {
      const entries: [string, T][] = JSON.parse(raw);
      const revived = entries.map(([k, v]) => [k, this.reviveDates(v)] as [string, T]);
      return new Map<string, T>(revived);
    } catch {
      return new Map<string, T>();
    }
  }

  getById(storeId: string, id: string): T | undefined {
    return this.getAll(storeId).get(id);
  }

  save(storeId: string, items: Map<string, T>): void {
    const entries = Array.from(items.entries());
    localStorage.setItem(this.getStorageKey(storeId), JSON.stringify(entries));
  }

  upsert(storeId: string, item: T): void {
    const all = this.getAll(storeId);
    all.set(item.id, item);
    this.save(storeId, all);
  }

  remove(storeId: string, id: string): void {
    const all = this.getAll(storeId);
    all.delete(id);
    this.save(storeId, all);
  }

  clear(storeId: string): void {
    localStorage.removeItem(this.getStorageKey(storeId));
  }
}
