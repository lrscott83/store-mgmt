import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';

const repo = new BaseRepository<SaleCredit>('saleCredits', [
  'date',
  'paidDate',
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

export class SaleCreditOfflineService {
  constructor(private readonly storeId: string) {}

  getAll(): SaleCredit[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getById(id: string): SaleCredit | undefined {
    return repo.getById(this.storeId, id);
  }

  getByDateRange(from: Date, to: Date): SaleCredit[] {
    const start = startOfDay(from);
    const end = startOfDay(addDays(to, 1));
    return this.getAll().filter((c) => c.date >= start && c.date < end);
  }

  getActiveToday(): SaleCredit[] {
    const todayStart = startOfDay(new Date());
    const tomorrowStart = startOfDay(addDays(new Date(), 1));
    return this.getAll().filter(
      (c) => c.isActive && c.date >= todayStart && c.date < tomorrowStart,
    );
  }

  /**
   * 1:1 port of Angular's `getUnPaidSaleCreditsInDayObservable`: active credits CREATED
   * today (via `date`, not `paidDate`), filtered to `!isPaid`. Feeds the "Créditos Por
   * Cobrar" panel on the Today Stats view.
   */
  getUnpaidCreatedToday(): SaleCredit[] {
    return this.getActiveToday().filter((c) => !c.isPaid);
  }

  /**
   * 1:1 port of Angular's `getPaidSaleCreditsInDayObservable`: active credits whose
   * `paidDate` falls within today's range, REGARDLESS of when they were created (unlike
   * `getUnpaidCreatedToday`, which filters by creation `date`). Feeds the "Créditos
   * Pagados" panel on the Today Stats view.
   */
  getPaidToday(): SaleCredit[] {
    const todayStart = startOfDay(new Date());
    const tomorrowStart = startOfDay(addDays(new Date(), 1));
    return this.getAll().filter(
      (c) =>
        c.isActive &&
        c.isPaid &&
        c.paidDate &&
        c.paidDate >= todayStart &&
        c.paidDate < tomorrowStart,
    );
  }

  createFromOrder(orderId: string, client: string, total: number): SaleCredit {
    const now = new Date();
    const credit: SaleCredit = {
      id: generateId(),
      orderId,
      client,
      total,
      date: now,
      paid: 0,
      isPaid: false,
      isActive: true,
      paidDate: null as unknown as Date,
      paidType: null as unknown as PaymentType,
      note: '',
      createdDate: now,
      createdByName: '',
      updatedDate: now,
      updatedByName: '',
    };
    repo.upsert(this.storeId, credit);
    return credit;
  }

  update(id: string, client: string, note: string): SaleCredit {
    const credit = repo.getById(this.storeId, id);
    if (!credit) throw new Error(`SaleCredit not found: ${id}`);
    const updated: SaleCredit = {
      ...credit,
      client,
      note,
      updatedDate: new Date(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  pay(id: string, paidType: PaymentType, note: string): SaleCredit {
    const credit = repo.getById(this.storeId, id);
    if (!credit) throw new Error(`SaleCredit not found: ${id}`);
    const now = new Date();
    // C-7: Full payment only — paid = total regardless of any entered amount
    const updated: SaleCredit = {
      ...credit,
      paid: credit.total,
      isPaid: true,
      paidDate: now,
      paidType,
      note: note || credit.note,
      updatedDate: now,
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  voidByOrderId(orderId: string): void {
    const all = repo.getAll(this.storeId);
    let changed = false;
    for (const [key, credit] of all) {
      if (credit.orderId === orderId) {
        all.set(key, { ...credit, isActive: false, updatedDate: new Date() });
        changed = true;
      }
    }
    if (changed) {
      repo.save(this.storeId, all);
    }
  }

  void(id: string): void {
    const credit = repo.getById(this.storeId, id);
    if (!credit) return;
    repo.upsert(this.storeId, { ...credit, isActive: false, updatedDate: new Date() });
  }
}
