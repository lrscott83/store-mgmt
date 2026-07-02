import type { Order, OrderItem } from '@store-mgmt/domain';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { SaleCreditOfflineService } from './sale-credit-offline-service';
import { ProductCategoryOfflineService } from './product-category-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import type { CategoryCartItemsView, ProductCartItemsView } from '../category-cart-items-view';

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

export class OrderOfflineService {
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
  ): Order {
    const now = new Date();
    const orderId = generateId();

    // Build orderItems with FIFO inventory deduction if needed
    const orderItems: OrderItem[] = cartItems.map((cartItem, index) => {
      const { product, quantity } = cartItem;
      let productCosts: import('@store-mgmt/domain').InventoryEntryCost[] = [];

      if (product.discountFromInvantory) {
        productCosts = this.inventoryService.getAvailableInventoryCosts(product.id, quantity);
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
      description: isCredit ? clientName : '',
      isActive: true,
      createdDate: now,
      createdByName: '',
      updatedDate: now,
      updatedByName: '',
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
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  deactivate(id: string): void {
    const order = repo.getById(this.storeId, id);
    if (!order) throw new Error(`Order not found: ${id}`);

    // Step 1: Mark order inactive
    const updated: Order = {
      ...order,
      isActive: false,
      updatedDate: new Date(),
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
}
