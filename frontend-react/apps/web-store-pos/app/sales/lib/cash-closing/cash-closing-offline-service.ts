import { Result, SalePaymentMethod } from '@store-mgmt/domain';
import type { Currency } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import {
  bumpDataRevision,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';
import { fromLocalDayKey, localDayRange } from '~/shared/lib/date-utils';
import { resolveCurrency } from '~/shared/lib/currency-totals';
import { normalizedOrderPaymentMethod } from '~/shared/lib/payment-method-resolved';
import { round2 } from '~/shared/lib/money';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import {
  CashClosingStatus,
  countedTotalOf,
  defaultDenominationsFor,
  emptyCashClosingStore,
  sortDenominationsDesc,
} from './cash-closing-types';
import type { CashClosing, CashClosingDenomination, CashClosingStore } from './cash-closing-types';

/** Entrada para guardar un borrador del cierre (estado `Open`). */
export interface CashClosingDraft {
  readonly dayKey: string;
  readonly currency: Currency;
  readonly openingCash: number;
  readonly denominations: readonly CashClosingDenomination[];
  readonly comment: string;
}

/** Esperado = apertura + efectivo de la venta del día (S7). Puro. */
export function expectedTotalOf(openingCash: number, cashSalesTotal: number): number {
  return round2(openingCash + cashSalesTotal);
}

/** `counted − expected`, redondeado (S7/S8). Puro. */
export function differenceOf(countedTotal: number, expectedTotal: number): number {
  return round2(countedTotal - expectedTotal);
}

/** Clave de un registro: un cierre por (día, moneda). */
export function cashClosingId(dayKey: string, currency: Currency): string {
  return `${dayKey}|${currency}`;
}

/**
 * Persistencia offline por tienda del cierre de efectivo (cierre-efectivo,
 * S13/S14). Espeja el patrón de `StorePaymentMethodsConfigService`: un único
 * `localStorage.setItem` (el "write door") que notifica el cambio de datos,
 * con caché por instancia invalidada por la revisión global.
 *
 * Entidad propia del dispositivo (`cashClosings`), registrada en
 * `BUSINESS_ENTITY_NAMES` para que `entity-migration` la cifre,
 * `store-data-reset` la borre y `damaged-data-recovery` la reporte — y para que
 * viaje en el export/import (S14).
 */
export class CashClosingOfflineService {
  private store: CashClosingStore | null = null;
  private lastStoreKey: string | undefined;
  private storeRevision: number | undefined;

  constructor(private readonly storeId: string) {}

  private getStorageKey(storeId: string): string {
    this.lastStoreKey = StorageKeys.entityKey('cashClosings', storeId);
    return this.lastStoreKey;
  }

  private readFromLocalStorage(storeId: string): CashClosingStore | null {
    return readEntityOrThrow(this.getStorageKey(storeId), (json) =>
      json ? (JSON.parse(json) as CashClosingStore) : null,
    );
  }

  /** Almacén de la tienda (auto-init vacío en una lectura genuinamente ausente). */
  getStore(storeId: string = this.storeId): CashClosingStore {
    const revision = useDataRevisionStore.getState().revision;
    if (
      !this.store ||
      this.getStorageKey(storeId) !== this.lastStoreKey ||
      revision > (this.storeRevision ?? -1)
    ) {
      const stored = this.readFromLocalStorage(storeId);
      this.store = stored ?? emptyCashClosingStore();
      this.storeRevision = revision;
    }
    return this.store;
  }

  /** Cierre de un (día, moneda), o `undefined` si nunca se abrió. */
  getClosing(
    dayKey: string,
    currency: Currency,
    storeId: string = this.storeId,
  ): CashClosing | undefined {
    const id = cashClosingId(dayKey, currency);
    return this.getStore(storeId).closings.find((closing) => closing.id === id);
  }

  /**
   * Denominaciones a ofrecer para una moneda: las guardadas por tienda (S13) o,
   * si no hay catálogo propio, los defaults de la moneda (S11).
   */
  getDenominationValues(currency: Currency, storeId: string = this.storeId): number[] {
    const catalog = this.getStore(storeId).denominationCatalog;
    const stored = catalog[String(currency)];
    return stored && stored.length > 0 ? [...stored] : defaultDenominationsFor(currency);
  }

  /** Agrega una denominación nueva al catálogo por tienda (S11/S13). Idempotente. */
  addDenominationValue(
    currency: Currency,
    value: number,
    storeId: string = this.storeId,
  ): number[] {
    if (!Number.isFinite(value) || value <= 0) return this.getDenominationValues(currency, storeId);
    const current = this.getDenominationValues(currency, storeId);
    const next = sortDenominationsDesc([...current, value]);
    const store = this.getStore(storeId);
    this.persist(storeId, {
      ...store,
      denominationCatalog: { ...store.denominationCatalog, [String(currency)]: next },
    });
    return next;
  }

  /**
   * Entradas monetarias del efectivo del día (todas las monedas): órdenes
   * activas del día, NO a crédito, con método resuelto `Efectivo`. Alimenta el
   * selector de moneda (`presentCurrencies`) y el total del Esperado.
   */
  getCashSalesEntries(
    dayKey: string,
    storeId: string = this.storeId,
  ): { amount: number; currency: Currency }[] {
    const { start, end } = localDayRange(fromLocalDayKey(dayKey));
    const orders = new OrderOfflineService(storeId).getActiveOrdersBetween(start, end);
    return orders
      .filter(
        (order) =>
          !order.isCredit &&
          normalizedOrderPaymentMethod(order) === SalePaymentMethod.Efectivo,
      )
      .map((order) => ({ amount: round2(order.total), currency: resolveCurrency(order.currency) }));
  }

  /**
   * Efectivo de la venta del día (S1): órdenes activas del día, NO a crédito, con
   * método resuelto `Efectivo` y en la moneda elegida. Nunca Transferencia ni Zelle.
   */
  getCashSalesTotal(
    dayKey: string,
    currency: Currency,
    storeId: string = this.storeId,
  ): number {
    const total = this.getCashSalesEntries(dayKey, storeId)
      .filter((entry) => entry.currency === currency)
      .reduce((sum, entry) => sum + entry.amount, 0);
    return round2(total);
  }

  /** Esperado para un (día, moneda) con la apertura indicada (S7). */
  getExpectedTotal(
    dayKey: string,
    currency: Currency,
    openingCash: number,
    storeId: string = this.storeId,
  ): number {
    return expectedTotalOf(openingCash, this.getCashSalesTotal(dayKey, currency, storeId));
  }

  /**
   * Guarda el borrador del cierre (estado `Open`) para que la vista pueda llenarse
   * durante el día (S2/S12). Conserva `createdDate/By` en un registro existente.
   */
  saveDraft(
    draft: CashClosingDraft,
    actor: string,
    storeId: string = this.storeId,
  ): CashClosing {
    const store = this.getStore(storeId);
    const id = cashClosingId(draft.dayKey, draft.currency);
    const existing = store.closings.find((closing) => closing.id === id);
    // Congelado (S2): un cierre ya `Closed` no se vuelve a escribir.
    if (existing?.status === CashClosingStatus.Closed) return existing;
    const now = new Date().toISOString();
    const denominations = this.normalizeDenominations(draft.denominations);
    const countedTotal = countedTotalOf(denominations);
    const expectedTotal = this.getExpectedTotal(
      draft.dayKey,
      draft.currency,
      draft.openingCash,
      storeId,
    );

    const record: CashClosing = {
      id,
      dayKey: draft.dayKey,
      currency: draft.currency,
      openingCash: round2(draft.openingCash),
      denominations,
      comment: draft.comment,
      status: CashClosingStatus.Open,
      countedTotal,
      expectedTotal,
      difference: differenceOf(countedTotal, expectedTotal),
      createdDate: existing?.createdDate ?? now,
      createdByName: existing?.createdByName ?? actor,
      updatedDate: now,
      updatedByName: actor,
    };

    this.persist(storeId, {
      ...store,
      closings: upsertById(store.closings, record),
    });
    return record;
  }

  /**
   * Cierra el cierre del día (S2): congela el registro con los totales
   * snapshotados. Un cierre ya `Closed` se devuelve sin cambios (congelado).
   */
  closeClosing(
    draft: CashClosingDraft,
    actor: string,
    storeId: string = this.storeId,
  ): CashClosing {
    const draftRecord = this.saveDraft(draft, actor, storeId);
    if (draftRecord.status === CashClosingStatus.Closed) return draftRecord;

    const now = new Date().toISOString();
    const closed: CashClosing = {
      ...draftRecord,
      status: CashClosingStatus.Closed,
      updatedDate: now,
      updatedByName: actor,
      closedDate: now,
      closedByName: actor,
    };
    const store = this.getStore(storeId);
    this.persist(storeId, {
      ...store,
      closings: upsertById(store.closings, closed),
    });
    return closed;
  }

  /** Lee el almacén como JSON crudo (export). */
  getStorageCashClosingsJson(storeId: string = this.storeId): string {
    return JSON.stringify(this.getStore(storeId));
  }

  /** Fusiona (upsert por id) un cierre importado — seam del sincronizador. */
  addImportedCashClosing(record: CashClosing, storeId: string = this.storeId): Result {
    return this.mergeImported(record, storeId);
  }

  /** Alias del seam de import: el cierre es un objeto con id, upsert por id. */
  updateImportedCashClosing(record: CashClosing, storeId: string = this.storeId): Result {
    return this.mergeImported(record, storeId);
  }

  /**
   * Fusiona el catálogo de denominaciones y los cierres de un JSON importado
   * (S14). Un cierre local ya `Closed` no se sobreescribe (congelado, S2); un
   * `Closed` importado sí sella uno `Open` local.
   */
  importStoreFromJson(json: string, storeId: string = this.storeId): Result {
    try {
      return this.mergeStore(JSON.parse(json) as CashClosingStore, storeId);
    } catch {
      return Result.Failure([]);
    }
  }

  /** Seam de import del sincronizador: fusiona el almacén importado (S14). */
  setImportedCashClosings(store: CashClosingStore, storeId: string = this.storeId): Result {
    return this.mergeStore(store, storeId);
  }

  private mergeStore(incoming: CashClosingStore, storeId: string): Result {
    try {
      const store = this.getStore(storeId);
      const catalog = { ...store.denominationCatalog };
      for (const [currencyKey, values] of Object.entries(incoming.denominationCatalog ?? {})) {
        catalog[currencyKey] = sortDenominationsDesc([
          ...(catalog[currencyKey] ?? []),
          ...values,
        ]);
      }
      let closings = [...store.closings];
      for (const record of incoming.closings ?? []) {
        closings = upsertById(closings, record, (local) =>
          local.status === CashClosingStatus.Closed,
        );
      }
      this.persist(storeId, { closings, denominationCatalog: catalog });
      return Result.Success();
    } catch {
      return Result.Failure([]);
    }
  }

  private mergeImported(record: CashClosing, storeId: string): Result {
    try {
      const store = this.getStore(storeId);
      this.persist(storeId, {
        ...store,
        closings: upsertById(store.closings, record, (local) =>
          local.status === CashClosingStatus.Closed,
        ),
      });
      return Result.Success();
    } catch {
      return Result.Failure([]);
    }
  }

  private normalizeDenominations(
    denominations: readonly CashClosingDenomination[],
  ): CashClosingDenomination[] {
    return denominations
      .filter((d) => Number.isFinite(d.value) && d.value > 0)
      .map((d) => ({ value: d.value, count: Math.max(0, Math.trunc(d.count)) }))
      .sort((a, b) => b.value - a.value);
  }

  private persist(storeId: string, next: CashClosingStore): void {
    localStorage.setItem(this.getStorageKey(storeId), encryptEntity(JSON.stringify(next)));
    this.store = next;
    // Notificación INMEDIATA (no coalescida): cada escritura es un único registro
    // —a diferencia de un import de cientos de filas—, así que el bump directo
    // (mismo criterio que `createOrder`) invalida a las demás instancias sin
    // diferir un microtask. Sellamos esta instancia con la revisión ya bumpeada
    // para no releer su propia escritura.
    bumpDataRevision();
    this.storeRevision = useDataRevisionStore.getState().revision;
  }
}

/** Inserta o reemplaza por id. `keepExisting` (opcional) preserva el local tal cual. */
function upsertById(
  list: readonly CashClosing[],
  record: CashClosing,
  keepExisting?: (local: CashClosing) => boolean,
): CashClosing[] {
  const index = list.findIndex((item) => item.id === record.id);
  if (index === -1) return [...list, record];
  if (keepExisting?.(list[index])) return [...list];
  const next = [...list];
  next[index] = record;
  return next;
}
