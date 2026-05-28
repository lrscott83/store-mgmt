import type { InventoryEntry } from '@store-mgmt/domain';
import { StorageKeys } from '../../../shared/lib/storage/storage-keys';

export class InventoryRepository {
  constructor(private readonly storeId: string) {}

  private getStorageKey(storeId: string): string {
    return StorageKeys.entityKey('inventoryentries', storeId);
  }

  private reviveEntry(entry: InventoryEntry): InventoryEntry {
    const revived = { ...entry } as Record<string, unknown>;
    if (typeof revived['date'] === 'string') {
      revived['date'] = new Date(revived['date'] as string);
    }
    if (typeof revived['createdDate'] === 'string') {
      revived['createdDate'] = new Date(revived['createdDate'] as string);
    }
    if (typeof revived['updatedDate'] === 'string') {
      revived['updatedDate'] = new Date(revived['updatedDate'] as string);
    }
    return revived as unknown as InventoryEntry;
  }

  getAll(storeId: string): Map<string, InventoryEntry[]> {
    const raw = localStorage.getItem(this.getStorageKey(storeId));
    if (!raw) return new Map<string, InventoryEntry[]>();
    try {
      const entries: [string, InventoryEntry[]][] = JSON.parse(raw);
      const revived = entries.map(
        ([productId, productEntries]) =>
          [productId, productEntries.map((e) => this.reviveEntry(e))] as [string, InventoryEntry[]],
      );
      return new Map<string, InventoryEntry[]>(revived);
    } catch {
      return new Map<string, InventoryEntry[]>();
    }
  }

  saveAll(storeId: string, map: Map<string, InventoryEntry[]>): void {
    const entries = Array.from(map.entries());
    localStorage.setItem(this.getStorageKey(storeId), JSON.stringify(entries));
  }

  getByProductId(storeId: string, productId: string): InventoryEntry[] {
    return this.getAll(storeId).get(productId) ?? [];
  }

  save(storeId: string, productId: string, entries: InventoryEntry[]): void {
    const map = this.getAll(storeId);
    map.set(productId, entries);
    this.saveAll(storeId, map);
  }

  remove(storeId: string, productId: string): void {
    const map = this.getAll(storeId);
    map.delete(productId);
    this.saveAll(storeId, map);
  }

  clear(storeId: string): void {
    localStorage.removeItem(this.getStorageKey(storeId));
  }

  findEntryById(
    storeId: string,
    entryId: string,
  ): { entry: InventoryEntry; productId: string } | undefined {
    const map = this.getAll(storeId);
    for (const [productId, entries] of map) {
      const entry = entries.find((e) => e.id === entryId);
      if (entry) return { entry, productId };
    }
    return undefined;
  }
}
