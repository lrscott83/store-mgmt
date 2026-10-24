import {
  DEFAULT_CURRENCY,
  OrderType,
  PaymentType,
  SalePaymentMethod,
  type Currency,
  type Order,
  type OrderPayment,
  type Product,
} from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { round2 } from '~/shared/lib/money';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductCategoryRepository } from '../repositories/product-category-repository';
import { ProductRepository } from '../repositories/product-repository';
import { OrderOfflineService, type OrderSnapshot } from './order-offline-service';
import {
  OnlineOrderPaymentStatus,
  orderingHttpService,
  type OnlineOrderDetail,
  type OnlineOrderDetailLine,
} from './ordering-http-service';

/**
 * A sale is registered in the POS local storage for every web-catalog order that becomes
 * paid. This module owns that bridge:
 *
 *   1. Read every paid order from the API, page by page (read-only; the backend is never
 *      written).
 *   2. For each order without a local sale carrying its id, make sure the inventory can
 *      absorb it — adding an entry for the MISSING quantity only, with the sale price as
 *      cost — and then register the sale through `OrderOfflineService.createOrder`, exactly
 *      like the cart does.
 *
 * Idempotency lives on the sale itself: `Order.onlineOrderId` is the key, so re-running the
 * sync never duplicates a sale. Runs are also single-flight: the panel fires the sync on mount
 * and again after every transition, and two overlapping runs would otherwise both pass the
 * guard before either writes.
 */

/** Services the bridge needs. Narrowed to the members it actually calls, so tests can fake them. */
export interface OnlineOrderSaleDeps {
  storeId: string;
  hasInventoryModule: boolean;
  orderService: Pick<OrderOfflineService, 'createOrder' | 'getStorageOrders'>;
  productRepository: Pick<ProductRepository, 'getProductById'>;
  inventoryService: Pick<InventoryOfflineService, 'getAvailableQuantity' | 'createInventoryEntry'>;
  orderingService: Pick<typeof orderingHttpService, 'listOrders' | 'getOrder'>;
}

export type OnlineOrderSaleSkipReason = 'not-paid' | 'already-registered' | 'empty' | 'failed';

export interface OnlineOrderSaleOutcome {
  registered: boolean;
  onlineOrderId: string;
  reason?: OnlineOrderSaleSkipReason;
}

export interface OnlineOrderSaleSyncResult {
  registered: number;
  skipped: number;
  failed: number;
}

/** `true` when this device already holds the local sale for `onlineOrderId`. */
export function isOnlineOrderSaleRegistered(orders: Order[], onlineOrderId: string): boolean {
  return orders.some((order) => order.onlineOrderId === onlineOrderId);
}

/**
 * Adds an inventory entry for exactly what the product lacks to cover `line.quantity`.
 *
 * The entry costs the SALE price (owner decision): the online order has no cost of its own,
 * and a zero cost would silently fake the profit of the sale. Nothing is added when the
 * product does not discount from inventory, when the inventory module is off, or when the
 * current stock already covers the line.
 */
function ensureStockEntry(
  line: OnlineOrderDetailLine,
  product: Product,
  deps: OnlineOrderSaleDeps,
): void {
  if (!deps.hasInventoryModule || !product.discountFromInvantory) return;

  const { available } = deps.inventoryService.getAvailableQuantity(line.productId);
  const missing = round2(line.quantity - available);
  if (missing <= 0) return;

  deps.inventoryService.createInventoryEntry(line.productId, missing, line.price, line.currency);
}

/**
 * Sale line built from the order snapshot when the product is not in this device's catalog.
 * The sale must register anyway (owner decision), so the line borrows name/price/currency
 * from the order and does not touch inventory — there is no product row to deduct from.
 */
function productFromOrderLine(line: OnlineOrderDetailLine): Product {
  const now = new Date();
  const currency = (line.currency ?? DEFAULT_CURRENCY) as Currency;

  return {
    id: line.productId,
    name: line.name,
    categoryId: '',
    categoryName: '',
    price: line.price,
    currency,
    order: 0,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: '',
    isActive: true,
    createdDate: now,
    createdByName: '',
  };
}

/**
 * Cart lines for the sale: the LOCAL product when it exists (so category, business id and
 * catalog order stay real) with the order's snapshot price, or a product synthesized from the
 * line when the catalog does not have it yet.
 */
export function buildSaleCartItems(
  lines: readonly OnlineOrderDetailLine[],
  deps: OnlineOrderSaleDeps,
): CartItem[] {
  return lines.map((line) => {
    const product = deps.productRepository.getProductById(line.productId);
    if (product) ensureStockEntry(line, product, deps);

    return {
      product: product ?? productFromOrderLine(line),
      quantity: line.quantity,
      price: line.price,
    };
  });
}

/**
 * A single cash payment row with identity rates.
 *
 * It is NOT decoration: a non-empty `payments` list makes `createOrder` skip the
 * payment-method percent/tax of the store, so the persisted total is exactly the catalog's
 * line sum. The catalog order carries no fee, no tax and no credit.
 */
export function buildCashPayment(total: number, currency: Currency): OrderPayment[] {
  return [
    {
      method: SalePaymentMethod.Efectivo,
      currency,
      amount: total,
      rateApplied: 1,
      rateId: null,
      rateMethod: null,
      rateCurrency: null,
      rateEffectiveFrom: null,
      targetRateApplied: 1,
      targetRateId: null,
      targetRateEffectiveFrom: null,
      amountInOrderCurrency: total,
    },
  ];
}

/**
 * Registers the POS sale for ONE paid online order. Never throws; the outcome reports why
 * nothing was written.
 */
export async function registerOnlineOrderSale(
  detail: OnlineOrderDetail,
  deps: OnlineOrderSaleDeps,
): Promise<OnlineOrderSaleOutcome> {
  if (detail.paymentStatus !== OnlineOrderPaymentStatus.Paid) {
    return { registered: false, onlineOrderId: detail.id, reason: 'not-paid' };
  }

  if (isOnlineOrderSaleRegistered(deps.orderService.getStorageOrders(), detail.id)) {
    return { registered: false, onlineOrderId: detail.id, reason: 'already-registered' };
  }

  if (detail.lines.length === 0) {
    return { registered: false, onlineOrderId: detail.id, reason: 'empty' };
  }

  const cartItems = buildSaleCartItems(detail.lines, deps);
  const currency = (cartItems[0].product.currency ?? DEFAULT_CURRENCY) as Currency;
  const total = round2(
    cartItems.reduce(
      (sum, item) => sum + round2((item.price ?? item.product.price) * item.quantity),
      0,
    ),
  );

  const snapshot: OrderSnapshot = { storeId: deps.storeId, onlineOrderId: detail.id };

  const response = await deps.orderService.createOrder(
    cartItems,
    OrderType.Normal,
    false,
    PaymentType.Efectivo,
    detail.code ? `Pedido web #${detail.code}` : 'Pedido web',
    detail.customerName ?? '',
    SalePaymentMethod.Efectivo,
    buildCashPayment(total, currency),
    snapshot,
  );

  return {
    registered: response.succeeded,
    onlineOrderId: detail.id,
    reason: response.succeeded ? undefined : 'failed',
  };
}

/** Server page size for the paid-order scan; 100 is the endpoint's hard cap. */
const PAID_ORDERS_PAGE_SIZE = 100;

/**
 * Upper bound on pages per run. The scan stops earlier on an empty or short page; this only
 * keeps a misreporting `total` from turning the loop into an unbounded request stream.
 */
const PAID_ORDERS_MAX_PAGES = 50;

/**
 * Single-flight guard. The panel starts the sync on mount and again after every status
 * transition without awaiting it, so two runs can overlap. Sharing the in-flight promise keeps
 * the check-then-act idempotency from being evaluated twice before either run writes.
 */
let inFlightSync: { storeId: string; promise: Promise<OnlineOrderSaleSyncResult> } | null = null;

/**
 * Conciles the paid online orders against the local sales.
 *
 * No date window on purpose: an order created yesterday and paid today is just as much a sale
 * of TODAY — the sale date is the moment it is written, which is the moment the payment is
 * seen. Filtering by the order's creation date (what the API's `from`/`to` hit) would silently
 * drop that case, which is a normal one: the order sits unpaid overnight and the customer pays
 * the next day.
 *
 * Every page is read: a store with more paid orders than one page would otherwise keep the
 * same first page forever and never reach the rest.
 */
export function syncPaidOnlineOrderSales(
  deps: OnlineOrderSaleDeps,
): Promise<OnlineOrderSaleSyncResult> {
  if (inFlightSync?.storeId === deps.storeId) return inFlightSync.promise;

  const promise = runPaidOnlineOrderSync(deps).finally(() => {
    if (inFlightSync?.promise === promise) inFlightSync = null;
  });

  inFlightSync = { storeId: deps.storeId, promise };
  return promise;
}

async function runPaidOnlineOrderSync(
  deps: OnlineOrderSaleDeps,
): Promise<OnlineOrderSaleSyncResult> {
  const result: OnlineOrderSaleSyncResult = { registered: 0, skipped: 0, failed: 0 };
  let inspected = 0;

  for (let page = 1; page <= PAID_ORDERS_MAX_PAGES; page += 1) {
    const response = await deps.orderingService.listOrders({
      paymentStatus: OnlineOrderPaymentStatus.Paid,
      page,
      pageSize: PAID_ORDERS_PAGE_SIZE,
    });

    if (!response.succeeded) return result;

    const items = response.data.items;

    for (const item of items) {
      if (isOnlineOrderSaleRegistered(deps.orderService.getStorageOrders(), item.id)) {
        result.skipped += 1;
        continue;
      }

      const detail = await deps.orderingService.getOrder(item.id);
      if (!detail.succeeded) {
        result.failed += 1;
        continue;
      }

      const outcome = await registerOnlineOrderSale(detail.data, deps);
      if (outcome.registered) result.registered += 1;
      else if (outcome.reason === 'failed') result.failed += 1;
      else result.skipped += 1;
    }

    inspected += items.length;

    // Done when the server runs out of rows or there is nothing left past this page.
    if (items.length === 0 || items.length < PAID_ORDERS_PAGE_SIZE) return result;
    if (inspected >= response.data.total) return result;
  }

  return result;
}

/** Production wiring: real offline services on the given store. */
export function createOnlineOrderSaleDeps(
  storeId: string,
  hasInventoryModule: boolean,
): OnlineOrderSaleDeps {
  const productRepository = new ProductRepository(
    storeId,
    new ProductCategoryRepository(storeId),
  );

  return {
    storeId,
    hasInventoryModule,
    orderService: new OrderOfflineService(storeId),
    productRepository,
    inventoryService: new InventoryOfflineService(storeId, productRepository),
    orderingService: orderingHttpService,
  };
}
