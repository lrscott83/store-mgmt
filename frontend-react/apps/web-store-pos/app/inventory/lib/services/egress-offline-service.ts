import type { EgressEntry } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';

// EgressEntry extends AuditableBaseModel which uses createdDate/updatedDate (not createdAt/updatedAt)
const repo = new BaseRepository<EgressEntry>('egress', [
  'date',
  'createdDate',
  'updatedDate',
]);

function generateId(): string {
  return crypto.randomUUID();
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export class EgressOfflineService {
  constructor(private readonly storeId: string) {}

  getAll(): EgressEntry[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getActiveToday(): EgressEntry[] {
    const todayStart = startOfDay(new Date());
    const tomorrowStart = startOfDay(addDays(new Date(), 1));
    return this.getAll().filter(
      (e) => e.isActive && e.date >= todayStart && e.date < tomorrowStart,
    );
  }

  create(
    productId: string,
    categoryId: string,
    quantity: number,
    egressType: EgressEntry['egressType'],
    notes: string,
    date: Date,
  ): EgressEntry {
    const now = new Date();
    const entry: EgressEntry = {
      id: generateId(),
      productId,
      categoryId,
      quantity,
      egressType,
      notes,
      date,
      isActive: true,
      createdDate: now,
      createdByName: '',
      updatedDate: now,
      updatedByName: '',
    };
    repo.upsert(this.storeId, entry);
    return entry;
    // NOTE: Does NOT touch InventoryOfflineService — Design Decision 4 (egress is informational only)
  }

  update(
    id: string,
    quantity: number,
    egressType: EgressEntry['egressType'],
    notes: string,
  ): EgressEntry {
    const entry = repo.getById(this.storeId, id);
    if (!entry) throw new Error(`EgressEntry not found: ${id}`);
    const updated: EgressEntry = {
      ...entry,
      quantity,
      egressType,
      notes,
      updatedDate: new Date(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  deactivate(id: string): void {
    const entry = repo.getById(this.storeId, id);
    if (!entry) throw new Error(`EgressEntry not found: ${id}`);
    repo.upsert(this.storeId, {
      ...entry,
      isActive: false,
      updatedDate: new Date(),
    });
    // NOTE: Does NOT restore inventory — Design Decision 4
  }
}
