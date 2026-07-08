import type { BaseResponseModel, BaseService, SaleCredit } from '@store-mgmt/domain';
import { DataResult, PaymentType, Result, SaleCreditErrors, success } from '@store-mgmt/domain';
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

  /**
   * WU3 (category B): returns SYNC `BaseResponseModel<SaleCredit[]>` (via `success(...)`),
   * matching Angular's `getSaleCreditsInDay` (`this.Success(...)`, sync — never async).
   * Emits the day's ACTIVE credits sorted ASC by date, mirroring Angular's
   * `.sort((e1, e2) => e1.date.getTime() - e2.date.getTime())`. Replaces the removed
   * `getByDateRange`/`getActiveToday` (no Angular correlate, flagged mismatch #2).
   */
  getSaleCreditsInDay(date: Date): BaseResponseModel<SaleCredit[]> {
    const startDate = startOfDay(date);
    const endDate = addDays(startDate, 1);
    const filtered = this.getAll()
      .filter((c) => c.isActive && c.date >= startDate && c.date < endDate)
      .sort((c1, c2) => c1.date.getTime() - c2.date.getTime());
    return success(filtered);
  }

  /**
   * WU4 (category C): 1:1 port of Angular's `getSaleCreditsInDayObservable`
   * (sale-credit-offline.service.ts:122-124 — `of(this.getSaleCreditsInDay(date))`).
   * Same-tick `Promise.resolve` mirrors `of(...)` over synchronous storage (design ADR-7).
   */
  getSaleCreditsInDayObservable(date: Date): Promise<BaseResponseModel<SaleCredit[]>> {
    return Promise.resolve(this.getSaleCreditsInDay(date));
  }

  /**
   * WU4 (category C): 1:1 port of Angular's `getUnPaidSaleCreditsInDayObservable`
   * (sale-credit-offline.service.ts:126-132) — renamed from `getUnpaidCreatedToday`
   * (flagged mismatch #3). Reuses {@link getSaleCreditsInDay} (active credits CREATED on
   * `date`, via `date` not `paidDate`) then filters `!isPaid`. Feeds the "Créditos Por
   * Cobrar" panel on the Today Stats view.
   */
  getUnPaidSaleCreditsInDayObservable(date: Date): Promise<BaseResponseModel<SaleCredit[]>> {
    const activeCreditsResponse = this.getSaleCreditsInDay(date);
    return Promise.resolve(
      success(
        activeCreditsResponse.succeeded
          ? activeCreditsResponse.data.filter((c) => !c.isPaid)
          : [],
      ),
    );
  }

  /**
   * WU4 (category C): 1:1 port of Angular's `getPaidSaleCreditsInDayObservable`
   * (sale-credit-offline.service.ts:134-143) — renamed from `getPaidToday` (flagged
   * mismatch #3). Active credits whose `paidDate` falls within the given day's range,
   * REGARDLESS of when they were created (unlike the unpaid sibling, which filters by
   * creation `date`), sorted ASC by `date` (not `paidDate`). Feeds the "Créditos
   * Pagados" panel on the Today Stats view.
   */
  getPaidSaleCreditsInDayObservable(date: Date): Promise<BaseResponseModel<SaleCredit[]>> {
    const startDate = startOfDay(date);
    const endDate = addDays(startDate, 1);
    const filtered = this.getAll()
      .filter(
        (c) =>
          c.isActive &&
          c.isPaid &&
          c.paidDate &&
          c.paidDate >= startDate &&
          c.paidDate < endDate,
      )
      .sort((c1, c2) => c1.date.getTime() - c2.date.getTime());
    return Promise.resolve(success(filtered));
  }

  /**
   * WU4 (category C, NEW method): 1:1 port of Angular's `getSaleCreditsObservable`
   * (sale-credit-offline.service.ts:145-147) — all ACTIVE credits, no other filter/sort.
   * No current Angular consumer (dead method in Angular too); ported for surface parity
   * only, no call-site to migrate.
   */
  getSaleCreditsObservable(): Promise<BaseResponseModel<SaleCredit[]>> {
    return Promise.resolve(success(this.getAll().filter((c) => c.isActive)));
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
   * the day-snapping {@link getSaleCreditsInDay}. 1:1 port of Angular's private
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
   * WU4 (category C): 1:1 port of Angular's `filterSaleCredits`
   * (sale-credit-offline.service.ts:149-157) — non-suffixed Observable, verified
   * `Observable<BaseResponseModel<SaleCredit[]>>`. Same-tick `Promise.resolve` mirrors
   * `of(...)`. Quirk (1:1 port): `isPaid` only constrains when truthy — `isPaid=false`
   * behaves as "no filter" on paid status (Angular: `!isPaid || credit.isPaid ===
   * isPaid`). `client` is a case-sensitive substring match (Angular:
   * `credit.client.includes(client)`).
   */
  filterSaleCredits(
    isPaid?: boolean,
    client?: string,
    start?: Date,
    end?: Date,
  ): Promise<BaseResponseModel<SaleCredit[]>> {
    const filtered = this.getAll().filter(
      (c) =>
        c.isActive &&
        (!client || c.client.includes(client)) &&
        (!isPaid || c.isPaid === isPaid) &&
        (!start || c.date >= start) &&
        (!end || c.date < end),
    );
    return Promise.resolve(success(filtered));
  }

  /**
   * WU2 (category D): 1:1 port of Angular's `createSaleCredit`
   * (sale-credit-offline.service.ts:41-65) — renamed from `createFromOrder`
   * (flagged mismatch #5). Always succeeds, returns SYNC `DataResult<SaleCredit>`
   * (`new DataResult(credit, true, [])`) — never throws.
   */
  createSaleCredit(orderId: string, client: string, total: number, note: string): DataResult<SaleCredit> {
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
      note,
      createdDate: now,
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };
    repo.upsert(this.storeId, credit);
    return new DataResult<SaleCredit>(credit, true, []);
  }

  /**
   * WU2 (category D): 1:1 port of Angular's `updateSaleCredit`
   * (sale-credit-offline.service.ts:67-79) — renamed from `update` (flagged mismatch #5).
   * NEVER throws — missing id returns SYNC `new DataResult(undefined, false,
   * [SaleCreditErrors.NotExists])` (removes the current `throw new Error`).
   */
  updateSaleCredit(id: string, client: string, note: string): DataResult<SaleCredit> {
    const credit = repo.getById(this.storeId, id);
    if (!credit) {
      return new DataResult<SaleCredit>(undefined, false, [SaleCreditErrors.NotExists]);
    }
    const updated: SaleCredit = {
      ...credit,
      client,
      note,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return new DataResult<SaleCredit>(updated, true, []);
  }

  /**
   * WU2 (category D): 1:1 port of Angular's `paidSaleCredit`
   * (sale-credit-offline.service.ts:81-97) — renamed from `pay` (flagged mismatch #5).
   * NEVER throws — same success/failure shape as {@link updateSaleCredit}.
   */
  paidSaleCredit(id: string, paidType: PaymentType, note: string): DataResult<SaleCredit> {
    const credit = repo.getById(this.storeId, id);
    if (!credit) {
      return new DataResult<SaleCredit>(undefined, false, [SaleCreditErrors.NotExists]);
    }
    const now = new Date();
    // C-7: Full payment only — paid = total regardless of any entered amount
    const updated: SaleCredit = {
      ...credit,
      paid: credit.total,
      isPaid: true,
      paidDate: now,
      paidType,
      note,
      updatedDate: now,
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return new DataResult<SaleCredit>(updated, true, []);
  }

  /**
   * WU2 (category D): 1:1 port of Angular's `deleteSaleCredit`
   * (sale-credit-offline.service.ts:99-109) — the real soft-delete domain command.
   * Sets isActive=false, stamps updatedDate/updatedByName. Returns SYNC
   * `Result.Success()`, or `Result.Failure([SaleCreditErrors.NotExists])` on a missing
   * id — NEVER throws (flagged mismatch #7).
   */
  deleteSaleCredit(id: string): Result {
    const credit = repo.getById(this.storeId, id);
    if (!credit) {
      return Result.Failure([SaleCreditErrors.NotExists]);
    }
    repo.upsert(this.storeId, {
      ...credit,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    });
    return Result.Success();
  }

  /**
   * ADR-5/flagged mismatch #6: private helper mirroring Angular's
   * `getSaleCreditByOrderId` (sale-credit-offline.service.ts:111-113) — finds the FIRST
   * ACTIVE credit for the given orderId via `.find()`, NOT a loop over all matches.
   */
  private getSaleCreditByOrderId(orderId: string): SaleCredit | undefined {
    return this.getAll().find((c) => c.isActive && c.orderId === orderId);
  }

  /**
   * WU2 (category D): 1:1 port of Angular's `deactivateSaleCreditByOrderId`
   * (sale-credit-offline.service.ts:115-118) — renamed from `voidByOrderId`. Behavior
   * fix (flagged mismatch #6, angular-bugs-policy): finds only the FIRST active credit
   * for `orderId` (`.find()`, not a loop over every match) and soft-deletes just that
   * one via {@link deleteSaleCredit}. Always resolves `Result.Success()` — even when no
   * credit is found (no-op success), matching Angular's ternary fallback.
   */
  deactivateSaleCreditByOrderId(orderId: string): Result {
    const credit = this.getSaleCreditByOrderId(orderId);
    return credit != null ? this.deleteSaleCredit(credit.id) : Result.Success();
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `addImportedSaleCredit`
   * (sale-credit-offline.service.ts:249-255) — normalizes `date` to a Date, appends the
   * credit, always returns Result.Success(). No call-site migration in this slice
   * (flagged mismatch #8).
   */
  addImportedSaleCredit(saleCredit: SaleCredit): Result {
    repo.upsert(this.storeId, { ...saleCredit, date: new Date(saleCredit.date) });
    return Result.Success();
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `updateImportedSaleCredit`
   * (sale-credit-offline.service.ts:257-274) — merges the incoming
   * isActive/client/note/updatedDate/updatedByName fields into the existing record by
   * id; ONLY overwrites paid/isPaid/paidDate when the existing record is unpaid
   * (`!saleCredit.paid`) — a no-op when the id is absent. Always returns
   * Result.Success().
   */
  updateImportedSaleCredit(importedSaleCredit: SaleCredit): Result {
    const existing = repo.getById(this.storeId, importedSaleCredit.id);
    if (existing) {
      const merged: SaleCredit = {
        ...existing,
        isActive: importedSaleCredit.isActive,
        client: importedSaleCredit.client,
        note: importedSaleCredit.note,
        updatedDate: importedSaleCredit.updatedDate,
        updatedByName: importedSaleCredit.updatedByName,
      };
      if (!existing.paid) {
        merged.paid = importedSaleCredit.paid;
        merged.isPaid = importedSaleCredit.isPaid;
        merged.paidDate = importedSaleCredit.paidDate;
      }
      repo.upsert(this.storeId, merged);
    }
    return Result.Success();
  }

  /**
   * BaseService<SaleCredit> `delete()` seam (ADR-1, Expense-slice precedent): stays a
   * SYNC React-only contract OUTSIDE the A/B/C/D conversion. Delegates to the real
   * domain command {@link deleteSaleCredit} and THROWS on failure — behavior change
   * (silent no-op → throw), flagged mismatch #7.
   */
  delete(id: string): void {
    const result = this.deleteSaleCredit(id);
    if (!result.succeeded) {
      throw new Error(result.errors[0]?.description ?? `SaleCredit could not be deleted: ${id}`);
    }
  }
}
