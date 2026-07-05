import type { BaseService, Order, OrderItem } from '@store-mgmt/domain';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { SaleCreditOfflineService } from './sale-credit-offline-service';
import { ProductCategoryOfflineService } from './product-category-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import type { CategoryCartItemsView, ProductCartItemsView } from '../category-cart-items-view';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
import { calculateOrderProfit } from '~/inventory/lib/profit-calculator';

/**
 * TopProduct — view model for getTopProductsProfitInLastMonth/getTopProductsSaleQuantityInLastMonth.
 * Sync equivalent of Angular's presentation TopProduct model.
 */
export interface TopProduct {
  id: string;
  name: string;
  value: number;
}

function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupId = String(item[key]);
    const collection = groups.get(groupId);
    if (collection) collection.push(item);
    else groups.set(groupId, [item]);
  }
  return groups;
}

function getOrderItemsTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getOrderItemsCount(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

const repo = new BaseRepository<Order>('orders', ['date', 'createdDate', 'updatedDate']);

function generateId(): string {
  return crypto.randomUUID();
}

export class OrderOfflineService implements BaseService<Order> {
  private readonly creditService: SaleCreditOfflineService;
  private readonly inventoryService: InventoryOfflineService;

  constructor(private readonly storeId: string) {
    this.creditService = new SaleCreditOfflineService(storeId);
    this.inventoryService = new InventoryOfflineService(storeId);
  }

  getAll(): Order[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getById(id: string): Order | undefined {
    return repo.getById(this.storeId, id);
  }

  getByDateRange(from: Date, to: Date): Order[] {
    const start = startOfDay(from);
    const end = startOfDay(addDays(to, 1));
    return this.getAll().filter(
      (o) => o.isActive && o.date >= start && o.date < end,
    );
  }

  getActiveOrdersInDay(date: Date): Order[] {
    const dayStart = startOfDay(date);
    const dayEnd = startOfDay(addDays(date, 1));
    return this.getAll().filter(
      (o) => o.isActive && o.date >= dayStart && o.date < dayEnd,
    );
  }

  /**
   * BUG FIX (angular-bugs-policy): Angular's `getOrdersInDay(date)` ignores the passed
   * `date` param entirely and always uses `new Date()`. React honors it — the whole
   * point of the parameter. Unlike `getActiveOrdersInDay`, this returns ALL orders in
   * the day regardless of `isActive` (1:1 port of Angular's own filter, which has no
   * isActive check).
   */
  getOrdersInDay(date: Date): Order[] {
    const dayStart = startOfDay(date);
    const dayEnd = startOfDay(addDays(date, 1));
    return this.getAll().filter((o) => o.date >= dayStart && o.date < dayEnd);
  }

  /**
   * ADR-5: financial helpers use RAW date boundaries (pre-snapped by the caller), NOT
   * the day-snapping `getByDateRange` (which would double-snap). 1:1 port of Angular's
   * private `getActiveOrdersBetweenDates`.
   */
  private activeOrdersBetween(start: Date, end: Date): Order[] {
    return this.getAll().filter((o) => o.isActive && o.date >= start && o.date < end);
  }

  getActiveOrdersPriceBetweenDates(start: Date, end: Date): number {
    return this.activeOrdersBetween(start, end).reduce((sum, o) => sum + o.total, 0);
  }

  getActiveOrdersPriceToday(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getActiveOrdersPriceBetweenDates(start, end);
  }

  getActiveOrdersPriceYesterday(): number {
    const start = startOfDay(addDays(new Date(), -1));
    const end = startOfDay(new Date());
    return this.getActiveOrdersPriceBetweenDates(start, end);
  }

  getActiveOrdersProfitBetweenDates(start: Date, end: Date): number {
    let profit = 0;
    for (const order of this.activeOrdersBetween(start, end)) {
      for (const item of order.orderItems) {
        profit += calculateOrderProfit(item).profit;
      }
    }
    return profit;
  }

  getActiveOrdersProfitToday(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getActiveOrdersProfitBetweenDates(start, end);
  }

  getActiveOrdersProfitYesterday(): number {
    const start = startOfDay(addDays(new Date(), -1));
    const end = startOfDay(new Date());
    return this.getActiveOrdersProfitBetweenDates(start, end);
  }

  /**
   * BUG FIX (angular-bugs-policy): Angular's private `getTopProductsInLastMonth(calculateProfit, top)`
   * takes a `top` param but its body hardcodes `.slice(0, 5)`, ignoring it — both public
   * callers (`getTopProductsProfitInLastMonth`/`getTopProductsSaleQuantityInLastMonth`) are
   * therefore always capped at 5 regardless of what they pass. React honors `top` (default 5).
   * Window: rolling last 29 days from `now` (RAW, not day-snapped — 1:1 port), active orders only.
   */
  private getTopProductsInLastMonth(calculateProfit: boolean, top: number): TopProduct[] {
    const now = new Date();
    const lastMonth = addDays(now, -29);
    const monthOrders = this.getAll().filter(
      (o) => o.isActive && o.date >= lastMonth && o.date < now,
    );

    const topProductsMap = new Map<string, TopProduct>();
    for (const order of monthOrders) {
      for (const item of order.orderItems) {
        let entry = topProductsMap.get(item.productId);
        if (!entry) {
          entry = { id: item.productId, name: item.productName, value: 0 };
          topProductsMap.set(item.productId, entry);
        }
        entry.value += calculateProfit ? calculateOrderProfit(item).profit : item.quantity;
      }
    }

    return Array.from(topProductsMap.values())
      .sort((p1, p2) => p2.value - p1.value)
      .slice(0, top);
  }

  getTopProductsProfitInLastMonth(top: number = 5): TopProduct[] {
    return this.getTopProductsInLastMonth(true, top);
  }

  getTopProductsSaleQuantityInLastMonth(top: number = 5): TopProduct[] {
    return this.getTopProductsInLastMonth(false, top);
  }

  /**
   * Sync replacement of Angular's `filterOrdersObservable`. `isCredit` is a tri-state:
   * -1 = any, 1 = credit only, 0 = non-credit only. `paymentType`/`start`/`end` are
   * optional and unbounded when falsy — 1:1 port, operates over active orders only,
   * RAW date comparisons (no internal day-snapping).
   */
  filterOrders(
    isCredit: number,
    paymentType?: PaymentType,
    start?: Date,
    end?: Date,
  ): Order[] {
    return this.getAll().filter(
      (o) =>
        o.isActive &&
        (isCredit === -1 || (isCredit === 1 && o.isCredit) || (isCredit === 0 && !o.isCredit)) &&
        (!paymentType || paymentType === o.paymentType) &&
        (!start || o.date >= start) &&
        (!end || o.date < end),
    );
  }

  /**
   * 1:1 port of Angular's `OrderOfflineService.getCategoryCartItemsView` — aggregates
   * today's active order items by category, then by product, for the "Cuadre del día"
   * (Today Stats) view. Category `order` is resolved from `ProductCategoryOfflineService`,
   * falling back to `Number.MAX_VALUE` when not found (Angular's exact fallback, so
   * ghost/deleted categories sort last if ever rendered in `order`).
   * NOTE: matches Angular's quirk of NOT explicitly sorting the returned array by `order`
   * — iteration order follows Map insertion order (first-seen category in orderItems).
   */
  getCategoryCartItemsView(date: Date): CategoryCartItemsView[] {
    const categoryService = new ProductCategoryOfflineService(this.storeId);
    const storageCategories = categoryService.getAll();
    const orderItems: OrderItem[] = this.getActiveOrdersInDay(date).flatMap(
      (order) => order.orderItems,
    );
    const categoryGroups = groupBy(orderItems, 'categoryId');

    const categoryItemsView: CategoryCartItemsView[] = [];
    categoryGroups.forEach((categoryItems) => {
      const item = categoryItems[0];
      const productGroups = groupBy(categoryItems, 'productId');
      const productItems: ProductCartItemsView[] = [];
      productGroups.forEach((products) => {
        const product = products[0];
        productItems.push({
          name: product.name,
          order: product.order,
          total: getOrderItemsTotal(products),
          itemsCount: getOrderItemsCount(products),
          price: product.price,
        });
      });
      const storageCategory = storageCategories.find((c) => c.id === item.categoryId);
      categoryItemsView.push({
        id: item.categoryId,
        name: item.categoryName,
        order: storageCategory ? storageCategory.order : Number.MAX_VALUE,
        total: getOrderItemsTotal(categoryItems),
        itemsCount: getOrderItemsCount(categoryItems),
        productItems,
      });
    });

    return categoryItemsView;
  }

  create(
    cartItems: CartItem[],
    paymentType: PaymentType,
    isCredit: boolean,
    clientName: string,
    orderType: OrderType = OrderType.Normal,
    // Defaults to true so the many pre-existing tests that don't exercise the
    // module-disabled path are unaffected; the one real caller (CartShell.handleCreateOrder)
    // always passes the actual authorizationService.hasInventoryModuleAvailable() value.
    hasInventoryModule: boolean = true,
    // Angular parity: createOrder's `details` param. Takes priority over the isCredit/
    // clientName fallback when provided; existing callers that omit it are unaffected.
    details?: string,
  ): Order {
    const now = new Date();
    const orderId = generateId();

    // Build orderItems with FIFO inventory deduction if needed
    const orderItems: OrderItem[] = cartItems.map((cartItem, index) => {
      const { product, quantity } = cartItem;
      let productCosts: import('@store-mgmt/domain').InventoryEntryCost[] = [];

      // 1:1 port of Angular's OrderOfflineService.createOrderItems gate
      // (order-offline.service.ts:360): `product.discountFromInvantory &&
      // authorizationService.hasInventoryModuleAvailable()`. Previously this only checked
      // discountFromInvantory, so a product left with discountFromInvantory=true after the
      // store's inventory module was disabled would still silently deduct inventory — fixed
      // here to match Angular exactly (L4 map diff-matrix #6 / prioritized-list item #7).
      // getAvailableInventoryCosts also receives the eligibility context so it self-defends
      // against isActive/availableToSale changes since add-to-cart time, mirroring Angular's
      // internal hasAvailableProductToSale chain.
      if (product.discountFromInvantory && hasInventoryModule) {
        productCosts = this.inventoryService.getAvailableInventoryCosts(product.id, quantity, {
          product,
          hasInventoryModule,
        });
      }

      return {
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        name: product.name,
        quantity,
        price: cartItem.price ?? product.price,
        productBusinessId: product.businessId ?? '',
        productCosts,
        order: index,
      };
    });

    const total = cartItems.reduce(
      (sum, item) => sum + (item.price ?? item.product.price) * item.quantity,
      0,
    );
    const itemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    const order: Order = {
      id: orderId,
      orderItems,
      total,
      itemsCount,
      date: now,
      type: orderType,
      paymentType,
      isCredit,
      description: details || (isCredit ? clientName : ''),
      isActive: true,
      createdDate: now,
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };

    repo.upsert(this.storeId, order);

    if (isCredit) {
      this.creditService.createFromOrder(orderId, clientName, total);
    }

    return order;
  }

  update(id: string, paymentType: PaymentType): Order {
    const order = repo.getById(this.storeId, id);
    if (!order) throw new Error(`Order not found: ${id}`);
    const updated: Order = {
      ...order,
      paymentType,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  /**
   * 1:1 port of Angular's `activateOrder` (`updateOrderActive(id, true)`) — flag-only,
   * no credit/inventory cascade (unlike deactivate). Return-type contract: void, throws
   * on not-found (Angular's Result-command collapses to this per design ADR-1).
   */
  activateOrder(id: string): void {
    const order = repo.getById(this.storeId, id);
    if (!order) throw new Error(`Order not found: ${id}`);
    repo.upsert(this.storeId, {
      ...order,
      isActive: true,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    });
  }

  deactivate(id: string): void {
    const order = repo.getById(this.storeId, id);
    if (!order) throw new Error(`Order not found: ${id}`);

    // Step 1: Mark order inactive
    const updated: Order = {
      ...order,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);

    // Step 2: Void associated credit if credit order
    if (order.isCredit) {
      this.creditService.voidByOrderId(id);
    }

    // Step 3: Restore inventory entries
    // Normalizes cost.id ?? cost.inventoryId for Angular-origin data (Decision 2)
    const normalizedItems = order.orderItems.map((oi) => ({
      ...oi,
      productCosts: oi.productCosts.map((cost) => ({
        ...cost,
        id: cost.id ?? (cost as unknown as { inventoryId: string }).inventoryId,
      })),
    }));
    this.inventoryService.increaseQuantitiesByOrderItems(normalizedItems);
  }

  /**
   * BaseService<Order> conformance alias for {@link deactivate}. Order has no
   * separate "plain" soft-delete concept in Angular — the only cancellation path
   * is the full deactivate cascade (void associated credit + restore inventory) —
   * so `delete` delegates to it rather than inventing partial-delete semantics.
   */
  delete(id: string): void {
    this.deactivate(id);
  }
}
