import type { BaseService, SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';

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

export class SaleCreditOfflineService implements BaseService<SaleCredit> {
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

  /**
   * 1:1 port of Angular's `getSaleCreditsTotalBefore` — sum of ALL active sale credits
   * with `date < threshold` (no lower bound).
   */
  getSaleCreditsTotalBefore(date: Date): number {
    return this.getAll()
      .filter((c) => c.isActive && c.date < date)
      .reduce((sum, c) => sum + c.total, 0);
  }

  getSaleCreditsTotal(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getSaleCreditsTotalBefore(end);
  }

  /**
   * 1:1 port of Angular's `getSaleCreditsTotalYesterday` — despite computing an unused
   * `endDate`, Angular's own body only ever calls `getSaleCreditsTotalBefore(startDate)`
   * (today's start), i.e. "everything before today" — not replicating the dead variable.
   */
  getSaleCreditsTotalYesterday(): number {
    const start = startOfDay(new Date());
    return this.getSaleCreditsTotalBefore(start);
  }

  /**
   * ADR-5: financial helpers use RAW date boundaries (pre-snapped by the caller), NOT
   * the day-snapping `getByDateRange`/`getActiveToday`. 1:1 port of Angular's private
   * `getActiveSaleCreditsBetweenDates`.
   */
  private activeSaleCreditsBetween(start: Date, end: Date): SaleCredit[] {
    return this.getAll().filter((c) => c.isActive && c.date >= start && c.date < end);
  }

  private activeUnpaidSaleCreditsBetween(start: Date, end: Date): SaleCredit[] {
    return this.activeSaleCreditsBetween(start, end).filter((c) => !c.isPaid);
  }

  getActiveSaleCreditsPriceBetweenDates(start: Date, end: Date): number {
    return this.activeSaleCreditsBetween(start, end).reduce((sum, c) => sum + c.total, 0);
  }

  getActiveSaleCreditsPriceToday(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getActiveSaleCreditsPriceBetweenDates(start, end);
  }

  getActiveSaleCreditsPriceYesterday(): number {
    const start = startOfDay(addDays(new Date(), -1));
    const end = startOfDay(new Date());
    return this.getActiveSaleCreditsPriceBetweenDates(start, end);
  }

  getActiveUnpaidSaleCreditsPriceToday(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.activeUnpaidSaleCreditsBetween(start, end).reduce((sum, c) => sum + c.total, 0);
  }

  getActiveUnpaidSaleCreditsPriceYesterday(): number {
    const start = startOfDay(addDays(new Date(), -1));
    const end = startOfDay(new Date());
    return this.activeUnpaidSaleCreditsBetween(start, end).reduce((sum, c) => sum + c.total, 0);
  }

  /**
   * Sync replacement of Angular's `filterSaleCredits` Observable. Quirk (1:1 port):
   * `isPaid` only constrains when truthy — `isPaid=false` behaves as "no filter" on
   * paid status (Angular: `!isPaid || credit.isPaid === isPaid`). `client` is a
   * case-sensitive substring match (Angular: `credit.client.includes(client)`).
   */
  filterSaleCredits(isPaid: boolean, client?: string, start?: Date, end?: Date): SaleCredit[] {
    return this.getAll().filter(
      (c) =>
        c.isActive &&
        (!client || c.client.includes(client)) &&
        (!isPaid || c.isPaid === isPaid) &&
        (!start || c.date >= start) &&
        (!end || c.date < end),
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
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
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
      updatedByName: getCurrentUserLogin(),
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
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  voidByOrderId(orderId: string): void {
    const all = repo.getAll(this.storeId);
    let changed = false;
    for (const [key, credit] of all) {
      if (credit.orderId === orderId) {
        all.set(key, {
          ...credit,
          isActive: false,
          updatedDate: new Date(),
          updatedByName: getCurrentUserLogin(),
        });
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
    repo.upsert(this.storeId, {
      ...credit,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    });
  }

  /**
   * BaseService<SaleCredit> conformance alias for {@link void}. `void` already IS
   * the plain soft-delete equivalent (isActive=false, no cascade, no-op on a
   * missing id) — this exposes the interface-required name with zero behavior change.
   */
  delete(id: string): void {
    this.void(id);
  }
}
