import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, Order } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { CurrencyTotalAmount } from '~/shared/components/multimonedas/currency-total-amount';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { BarChartIcon, ChevronDownIcon, DownloadIcon } from '~/shared/components/ui/icons';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { addDays, formatLocalDate, fromLocalDayKey, groupByLocalDay, startOfDay } from '~/shared/lib/date-utils';
import type { LocalDayGroup } from '~/shared/lib/date-utils';
import { showBlockingInfo } from '~/shared/lib/blocking-alert';
import { DateRangeFilter } from '~/shared/components/date-range-filter/date-range-filter';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { generateProductRowsForDate } from '~/reports/lib/pdf/generate-product-rows-for-date';
import { exportInventoryTodaySalePdf } from '~/reports/lib/pdf/inventory-today-sale-pdf';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';
import { OrderOfflineService } from '../lib/services/order-offline-service';
import { round2 } from '~/shared/lib/money';
import { ProductRepository } from '../lib/repositories/product-repository';
import { ProductCategoryRepository } from '../lib/repositories/product-category-repository';
import { OrderList } from '../components/order-list';
import { DaySalesSummaryModal } from '../components/day-sales-summary-modal';
import type { DaySalesSummary } from '../components/day-sales-summary-modal';
import {
  collectOrderPaymentMethodKeys,
  matchesOrderPaymentFilter,
  paymentMethodKeyToLabel,
} from '~/shared/lib/payment-filter-options';
import { useMultiStore } from '~/shared/lib/hooks/use-multi-store';
import {
  MultiStoreSection,
  MultiStoreTotal,
  MULTISTORE_FULL_BLEED,
} from '~/shared/components/multistore/multi-store-section';
import {
  groupOrdersByDay,
  readStoreOrders,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';

export const clientLoader = featureLoader([EFeatures.SalesHistory]);

/**
 * Filtro de método de pago DINÁMICO (2026-09-19): las opciones se derivan de
 * las órdenes visibles de la vista (single-store: todo el historial; multi-
 * store: el conjunto del filtro de tienda vigente) — solo aparecen los
 * métodos realmente presentes, con etiquetas "Transferencia (CUP|USD|…)"
 * vía `payment-filter-options` (legacy Tarjeta → Transferencia). El estado
 * guarda la CLAVE; si deja de existir en los datos se resetea a "Todas".
 *
 * Per-day sales summary for the gear-menu popup — same metrics and aggregation as
 * reports/today's `computeTodayReport` (today-report.tsx), scoped to ONE local day.
 * Uses `getOrdersInDay` (which honors its date param, unlike `getActiveOrdersInDay`
 * with Angular's always-today quirk), then keeps only active orders to match the
 * today report's isActive filter. Rule 12: no shared aggregation service is invented
 * on the React side — the today report keeps its computation inline in the route file,
 * so this day-scoped variant lives here too.
 *
 * multi-store-panels: the multi-store mode replicates this per store from the
 * store's own read-only orders (`readStoreOrders`), never instantiating the
 * write-capable offline service for another store.
 */
function computeDaySalesSummary(storeId: string, dateId: string): DaySalesSummary {
  const orderService = new OrderOfflineService(storeId);
  const day = fromLocalDayKey(dateId);
  const orders = orderService.getOrdersInDay(day).filter((o) => o.isActive);

  let totalRevenue = 0;
  let totalCost = 0;

  for (const order of orders) {
    for (const item of order.orderItems) {
      const result = calculateOrderProfit(item);
      totalRevenue = round2(totalRevenue + result.revenue);
      totalCost = round2(totalCost + result.cost);
    }
  }

  return {
    date: day,
    orderCount: orders.length,
    totalRevenue,
    totalCost,
    totalProfit: round2(totalRevenue - totalCost),
  };
}

/** multi-store-panels: per-store day summary from read-only orders (same math as above). */
function computeMultiStoreDaySummary(orders: Order[], dateId: string): DaySalesSummary {
  const day = fromLocalDayKey(dateId);
  const dayStart = new Date(day);
  const dayEnd = new Date(day);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayOrders = orders.filter((o) => o.isActive && o.date >= dayStart && o.date < dayEnd);

  let totalRevenue = 0;
  let totalCost = 0;

  for (const order of dayOrders) {
    for (const item of order.orderItems) {
      const result = calculateOrderProfit(item);
      totalRevenue = round2(totalRevenue + result.revenue);
      totalCost = round2(totalCost + result.cost);
    }
  }

  return {
    date: day,
    orderCount: dayOrders.length,
    totalRevenue,
    totalCost,
    totalProfit: round2(totalRevenue - totalCost),
  };
}

/**
 * Matches Angular's `orders.component.html` (Historial de Ventas): payment-type
 * + isCredit radio filters, orders grouped by day into an accordion, each date
 * panel wraps `OrderList` (read-only, no edit/delete actions — Angular's
 * `app-order-list` here has no `[readOnly]` binding, default `true`). No date
 * range picker exists in Angular; the React-only range inputs are removed.
 *
 * multi-store-panels: OwnerAdmin + MultiStores + ≥2 tiendas activas → los
 * filtros (tipo de pago / pagadas-créditos) son GLOBALES fuera de los
 * paneles, un panel colapsable por tienda con su acordeón por día (con las
 * mismas acciones del día, scopeadas a esa tienda) y totales fuera de los
 * paneles. Sin MultiStores la vista es idéntica a la original.
 */
export function OrdersPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const multiMonedas = hasMultiMonedasAvailable(user);
  const [groups, setGroups] = useState<LocalDayGroup<Order>[]>([]);
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(new Set());
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [isCredit, setIsCredit] = useState<number>(-1);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [daySummary, setDaySummary] = useState<DaySalesSummary | null>(null);
  const { enabled: multiStoreEnabled, stores: multiStoreStores } = useMultiStore();
  const [storeOrders, setStoreOrders] = useState<Map<string, Order[]>>(new Map());
  const [selectedMultiStoreId, setSelectedMultiStoreId] = useState<string | null>(null);

  function loadOrders() {
    const service = new OrderOfflineService(storeId);
    // Date-range (2026-09-21): same half-open [start, next-day midnight) window
    // the credits view feeds its service — end day INCLUSIVE.
    const start = dateRange.start ? startOfDay(dateRange.start) : null;
    const end = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : null;
    const filtered = service
      .getStorageOrders()
      .filter((o) => o.isActive)
      .filter(
        (o) => isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit),
      )
      .filter((o) => {
        const date = new Date(o.date);
        if (start && date < start) return false;
        if (end && date >= end) return false;
        return true;
      });
    setGroups(
      groupByLocalDay(
        filtered,
        (o) => new Date(o.date),
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    );
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadOrders reads storeId, isCredit and the dateRange bounds
  }, [storeId, isCredit, dateRange.start, dateRange.end]);

  // multi-store-panels: raw per-store orders (read-only, per-store DEK);
  // the global payment/credit filters apply across all stores below.
  useEffect(() => {
    if (!multiStoreEnabled) {
      setStoreOrders(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        multiStoreStores.map(async (store) => {
          const dek = await unwrapStoreDek(store.id);
          return [store.id, readStoreOrders(store.id, dek)] as const;
        }),
      );
      if (!cancelled) setStoreOrders(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [multiStoreEnabled, multiStoreStores]);

  function toggleDatePanel(dateId: string) {
    setExpandedDateIds((prev) => {
      const next = new Set(prev);
      if (next.has(dateId)) next.delete(dateId);
      else next.add(dateId);
      return next;
    });
  }

  // Per-day "Inventario a precio de venta" export: rebuilds the 13-column
  // inventory-at-sale-price ledger faithfully reconstructed for the LOCAL day group
  // (same aggregation as generateProductRows, but scoped to `day` — entries restored
  // to their end-of-day stock via the FIFO productCosts ledger). `dateId` is the
  // LOCAL `yyyy-mm-dd` grouping key; it is parsed back into the local midnight via
  // `fromLocalDayKey` (the generator snaps with `startOfDay` anyway) and reused
  // verbatim for the filename. The report counts ALL active orders, matching the
  // today report (isActive only).
  const handleGenerateDayReport = useCallback(
    async (storeIdForReport: string, dateId: string) => {
      const categoryRepository = new ProductCategoryRepository(storeIdForReport);
      const productRepository = new ProductRepository(storeIdForReport, categoryRepository);
      const orderService = new OrderOfflineService(storeIdForReport);
      const inventoryService = new InventoryOfflineService(storeIdForReport, productRepository);

      const products = productRepository.getAvailableProducts();
      const orders = orderService.getStorageOrders().filter((o) => o.isActive);
      const inventories = new Map<string, InventoryEntry[]>();
      for (const product of products) {
        inventories.set(product.id, inventoryService.getProductInventoriesByProductId(product.id));
      }

      const { rows, suspectProductNames } = generateProductRowsForDate({
        products,
        orders,
        inventories,
        day: fromLocalDayKey(dateId),
      });
      if (suspectProductNames.length > 0) {
        showBlockingInfo(
          intl.formatMessage({ id: 'GENERAL.INFORMATION' }),
          intl.formatMessage(
            { id: 'SALES.ORDERS.REPORT_SUSPECT_WARNING' },
            { names: suspectProductNames.join(', ') },
          ),
        );
      }
      await exportInventoryTodaySalePdf(rows, `${dateId}_ipv.pdf`);
    },
    [intl],
  );

  /** Base (activo + crédito) — el filtro de pago se aplica aparte por clave. */
  const multiBaseFilteredOrders = (orders: Order[]): Order[] =>
    orders
      .filter((o) => o.isActive)
      .filter(
        (o) => isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit),
      );

  // ─── multi-store mode ────────────────────────────────────────────────────
  if (multiStoreEnabled) {
    // Date range applied client-side before rendering: end day INCLUSIVE → the
    // same half-open [start, next-day midnight) window the single-store load uses.
    const rangeStart = dateRange.start ? startOfDay(dateRange.start) : null;
    const rangeEnd = dateRange.end ? startOfDay(addDays(dateRange.end, 1)) : null;
    const rangeFilter = (o: Order): boolean => {
      const date = new Date(o.date);
      if (rangeStart && date < rangeStart) return false;
      if (rangeEnd && date >= rangeEnd) return false;
      return true;
    };

    const visibleStoreIds =
      selectedMultiStoreId === null
        ? multiStoreStores.map((s) => s.id)
        : [selectedMultiStoreId];

    // Opciones dinámicas: métodos presentes en el conjunto visible por el
    // filtro de tienda (con "Todas las tiendas" agrega todas).
    const baseOrders = visibleStoreIds.flatMap((id) => multiBaseFilteredOrders(storeOrders.get(id) ?? []));
    const paymentOptions = collectOrderPaymentMethodKeys(baseOrders.filter(rangeFilter));
    const paymentActive =
      paymentKey !== null && paymentOptions.includes(paymentKey) ? paymentKey : null;
    const visibleOrders = (orders: Order[]): Order[] =>
      multiBaseFilteredOrders(orders).filter(rangeFilter).filter(
        (o) => !paymentActive || matchesOrderPaymentFilter(o, paymentActive),
      );

    const totals = visibleStoreIds.reduce(
      (acc, id) => {
        for (const order of visibleOrders(storeOrders.get(id) ?? [])) {
          acc.count += 1;
          acc.total = round2(acc.total + order.total);
        }
        return acc;
      },
      { count: 0, total: 0 },
    );

    const totalEntries = visibleStoreIds.flatMap((id) =>
      visibleOrders(storeOrders.get(id) ?? []).map((order) => ({
        amount: order.total,
        currency: order.currency,
      })),
    );

    const paymentFieldset = (
      <fieldset className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="multistore-paymentType"
            checked={paymentActive === null}
            onChange={() => setPaymentKey(null)}
            className="accent-primary"
          />
          Todas
        </label>
        {paymentOptions.map((key) => (
          <label key={key} className="flex items-center gap-1 text-sm text-text">
            <input
              type="radio"
              name="multistore-paymentType"
              checked={paymentActive === key}
              onChange={() => setPaymentKey(key)}
              className="accent-primary"
            />
            {paymentMethodKeyToLabel(key)}
          </label>
        ))}
      </fieldset>
    );

    return (
      <Card
        padding="tight"
        className={MULTISTORE_FULL_BLEED}
        title={
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {intl.formatMessage({ id: 'ORDERS.TITLE' })}
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                ({totals.count})
              </span>
            </span>
            <span className="text-sm font-semibold text-primary whitespace-nowrap">
              <CurrencyTotalAmount
                legacyTotal={totals.total}
                entries={totalEntries}
                multiMonedas={multiMonedas}
              />
            </span>
          </div>
        }
      >
        <MultiStoreSection
          stores={multiStoreStores}
          selectedStoreId={selectedMultiStoreId}
          onSelectedStoreIdChange={setSelectedMultiStoreId}
          filters={
            // Petición 2026-09-24: tres filas de filtros — fila 1: tienda
            // (select del componente compartido) + rango de fechas en la MISMA
            // fila, estirado hacia la derecha (mismo patrón flex-1 que
            // credits.tsx); fila 2: método de pago; fila 3: pagadas/créditos.
            // Las filas 2 y 3 son w-full para que flex-wrap del componente
            // compartido las baje a su propia línea debajo del select.
            <>
              <DateRangeFilter
                value={dateRange}
                onApply={setDateRange}
                className="flex-1 min-w-0"
              />
              <div className="w-full">{paymentFieldset}</div>
              <div className="w-full">
                <fieldset className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1 text-sm text-text">
                    <input
                      type="radio"
                      name="multistore-isCredit"
                      checked={isCredit === -1}
                      onChange={() => setIsCredit(-1)}
                      className="accent-primary"
                    />
                    Todas
                  </label>
                  <label className="flex items-center gap-1 text-sm text-text">
                    <input
                      type="radio"
                      name="multistore-isCredit"
                      checked={isCredit === 0}
                      onChange={() => setIsCredit(0)}
                      className="accent-primary"
                    />
                    Pagadas
                  </label>
                  <label className="flex items-center gap-1 text-sm text-text">
                    <input
                      type="radio"
                      name="multistore-isCredit"
                      checked={isCredit === 1}
                      onChange={() => setIsCredit(1)}
                      className="accent-primary"
                    />
                    <span className="text-warning">Créditos</span>
                  </label>
                </fieldset>
              </div>
            </>
          }
          renderStoreCount={(store) => {
            const filtered = visibleOrders(storeOrders.get(store.id) ?? []);
            return `(${filtered.length})`;
          }}
          renderStoreTotals={(store) => {
            const filtered = visibleOrders(storeOrders.get(store.id) ?? []);
            const total = filtered.reduce((t, o) => t + o.total, 0);
            return <MultiStoreTotal value={total} />;
          }}
        >
          {(store) => {
            const filtered = visibleOrders(storeOrders.get(store.id) ?? []);
            if (filtered.length === 0) {
              return (
                <div className="py-4 text-center text-text-muted">
                  {intl.formatMessage({ id: 'MULTISTORE.NO_LOCAL_DATA' })}
                </div>
              );
            }
            // Same day-grouping as the single-store view (newest day first),
            // with the same per-day actions scoped to this store.
            return (
              <div className="space-y-2">
                {groupOrdersByDay(filtered).map((g) => {
                  const dateId = g.dayKey;
                  const key = `${store.id}:${dateId}`;
                  const isExpanded = expandedDateIds.has(key);
                  return (
                    <div key={key} className="rounded border border-border">
                      <div className="flex items-center gap-1 px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleDatePanel(key)}
                          className="flex w-full items-center justify-between gap-2 text-left"
                          data-testid={`multistore-date-panel-toggle-${store.id}-${dateId}`}
                          aria-expanded={isExpanded}
                        >
                          <span className="text-xs font-medium text-text">
                            {formatLocalDate(g.date)} ({g.items.length})
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text whitespace-nowrap">
                              <CurrencyTotalAmount
                                legacyTotal={g.items.reduce((t, o) => t + o.total, 0)}
                                entries={g.items.map((order) => ({
                                  amount: order.total,
                                  currency: order.currency,
                                }))}
                                multiMonedas={multiMonedas}
                              />
                            </span>
                            <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                          </span>
                        </button>
                        <ActionMenu
                          testId={`multistore-day-actions-toggle-${store.id}-${dateId}`}
                          label="Opciones del día"
                          widthClass="min-w-52"
                        >
                          {/* PDF export uses the write-capable offline services
                              (auto-init) — only safe against the SELECTED store,
                              whose DEK is the global one. Other stores keep the
                              read-only day summary. */}
                          {store.id === storeId && (
                            <ActionMenuItem
                              intent="edit"
                              icon={<DownloadIcon />}
                              onClick={() => void handleGenerateDayReport(store.id, dateId)}
                              data-testid={`multistore-day-report-button-${store.id}-${dateId}`}
                            >
                              {intl.formatMessage({ id: 'REPORT.INVENTORY_TODAY_SALE' })}
                            </ActionMenuItem>
                          )}
                          <ActionMenuItem
                            intent="edit"
                            icon={<BarChartIcon />}
                            onClick={() =>
                              setDaySummary(
                                computeMultiStoreDaySummary(storeOrders.get(store.id) ?? [], dateId),
                              )
                            }
                            data-testid={`multistore-day-summary-button-${store.id}-${dateId}`}
                          >
                            {intl.formatMessage({ id: 'SALES.ORDERS.DAY_SALES_SUMMARY' })}
                          </ActionMenuItem>
                        </ActionMenu>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border px-2 py-2">
                          <OrderList orders={g.items} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }}
        </MultiStoreSection>
        {daySummary && (
          <DaySalesSummaryModal summary={daySummary} onClose={() => setDaySummary(null)} />
        )}
      </Card>
    );
  }

  // ─── single-store mode ───────────────────────────────────────────────────
  // Opciones dinámicas de las órdenes cargadas (activo + crédito); el filtro
  // de pago se aplica en render para que opciones y filas salgan del mismo
  // conjunto de datos.
  const allOrders = groups.flatMap((g) => g.items);
  const paymentOptions = collectOrderPaymentMethodKeys(allOrders);
  const paymentActive =
    paymentKey !== null && paymentOptions.includes(paymentKey) ? paymentKey : null;
  const visibleGroups: LocalDayGroup<Order>[] = paymentActive
    ? groups
        .map((g) => ({
          ...g,
          items: g.items.filter((o) => matchesOrderPaymentFilter(o, paymentActive)),
        }))
        .filter((g) => g.items.length > 0)
    : groups;

  const ordersCount = visibleGroups.reduce((count, g) => count + g.items.length, 0);
  const ordersTotal = visibleGroups.reduce(
    (total, g) => total + g.items.reduce((t, o) => t + o.total, 0),
    0,
  );
  const totalEntries = visibleGroups.flatMap((g) =>
    g.items.map((order) => ({ amount: order.total, currency: order.currency })),
  );

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {/* ORDERS.TITLE */}
            {intl.formatMessage({ id: 'ORDERS.TITLE' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({ordersCount})
            </span>
          </span>
          <span className="text-sm font-semibold text-text whitespace-nowrap">
            <CurrencyTotalAmount
              legacyTotal={ordersTotal}
              entries={totalEntries}
              multiMonedas={multiMonedas}
            />
          </span>
        </div>
      }
    >
      {/* Fila 1: rango de fechas alineado a la derecha (petición 2026-09-21);
          filas 2/3: método de pago y pagadas/créditos. */}
      <div className="mb-3 flex justify-end">
        <DateRangeFilter value={dateRange} onApply={setDateRange} className="w-64 max-w-full" />
      </div>

      <fieldset className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="paymentType"
            checked={paymentActive === null}
            onChange={() => setPaymentKey(null)}
            className="accent-primary"
          />
          Todas
        </label>
        {paymentOptions.map((key) => (
          <label key={key} className="flex items-center gap-1 text-sm text-text">
            <input
              type="radio"
              name="paymentType"
              checked={paymentActive === key}
              onChange={() => setPaymentKey(key)}
              className="accent-primary"
            />
            {paymentMethodKeyToLabel(key)}
          </label>
        ))}
      </fieldset>

      <fieldset className="mb-4 flex flex-wrap gap-4">
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="isCredit"
            checked={isCredit === -1}
            onChange={() => setIsCredit(-1)}
            className="accent-primary"
          />
          Todas
        </label>
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="isCredit"
            checked={isCredit === 0}
            onChange={() => setIsCredit(0)}
            className="accent-primary"
          />
          Pagadas
        </label>
        <label className="flex items-center gap-1 text-sm text-text">
          <input
            type="radio"
            name="isCredit"
            checked={isCredit === 1}
            onChange={() => setIsCredit(1)}
            className="accent-primary"
          />
          <span className="text-warning">Créditos</span>
        </label>
      </fieldset>

      {visibleGroups.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* ORDERS.NO_ORDERS_FOUND */}
          {intl.formatMessage({ id: 'ORDERS.NO_ORDERS_FOUND' })}
        </InfoBox>
      )}

      <div className="space-y-2">
        {visibleGroups.map((g) => {
          const dateId = g.dayKey;
          const isExpanded = expandedDateIds.has(dateId);
          return (
            <div key={dateId} className="rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleDatePanel(dateId)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                  data-testid={`date-panel-toggle-${dateId}`}
                  aria-expanded={isExpanded}
                >
                  <span className="text-sm font-medium text-text">
                    {formatLocalDate(g.date)} ({g.items.length})
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text whitespace-nowrap">
                      <CurrencyTotalAmount
                        legacyTotal={g.items.reduce((t, o) => t + o.total, 0)}
                        entries={g.items.map((order) => ({
                          amount: order.total,
                          currency: order.currency,
                        }))}
                        multiMonedas={multiMonedas}
                      />
                    </span>
                    <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                  </span>
                </button>
                <ActionMenu
                  testId={`day-actions-toggle-${dateId}`}
                  label="Opciones del día"
                  widthClass="min-w-52"
                >
                  <ActionMenuItem
                    intent="edit"
                    icon={<DownloadIcon />}
                    onClick={() => void handleGenerateDayReport(storeId, dateId)}
                    data-testid={`day-report-button-${dateId}`}
                  >
                    {intl.formatMessage({ id: 'REPORT.INVENTORY_TODAY_SALE' })}
                  </ActionMenuItem>
                  <ActionMenuItem
                    intent="edit"
                    icon={<BarChartIcon />}
                    onClick={() => setDaySummary(computeDaySalesSummary(storeId, dateId))}
                    data-testid={`day-summary-button-${dateId}`}
                  >
                    {intl.formatMessage({ id: 'SALES.ORDERS.DAY_SALES_SUMMARY' })}
                  </ActionMenuItem>
                </ActionMenu>
              </div>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <OrderList orders={g.items} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {daySummary && (
        <DaySalesSummaryModal summary={daySummary} onClose={() => setDaySummary(null)} />
      )}
    </Card>
  );
}

export default OrdersPage;
