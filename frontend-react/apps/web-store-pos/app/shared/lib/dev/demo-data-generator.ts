import type { Order, OrderItem } from '@store-mgmt/domain';
import { OrderType } from '@store-mgmt/domain';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { buildDemoPlan, type DemoProductSpec } from './demo-data-plan';

/**
 * DEMO-SEED — dev-only runner. Persists the deterministic 90-day plan into the STORE's
 * local storage using the same offline services the screens read, so dashboards, day
 * statistics and histories immediately show three months of data.
 *
 * Not meant for production: it refuses to run when the store already has orders (no
 * duplicate/append semantics) and is only reachable through the DEV hook in root.tsx.
 */

export interface DemoSeedResult {
  ok: boolean;
  message: string;
  ordersCreated: number;
  expensesCreated: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Build a full OrderItem exactly as OrderOfflineService.createOrder would (name/category/order). */
function buildOrderItem(
  product: NonNullable<ReturnType<ProductRepository['getProductById']>>,
  quantity: number,
  index: number,
  productCosts: OrderItem['productCosts'],
): OrderItem {
  return {
    productId: product.id,
    productName: product.name,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    name: product.name,
    quantity,
    price: product.price,
    productBusinessId: product.businessId ?? '',
    productCosts,
    order: product.order,
  };
}

export function seedDemoDataForStore(storeId: string): DemoSeedResult {
  try {
    const orderService = new OrderOfflineService(storeId);
    const existingOrders = orderService.getStorageOrders();
    if (existingOrders.length > 0) {
      return {
        ok: false,
        message:
          'La tienda ya tiene órdenes guardadas; el generador demo no se ejecuta para no duplicar datos. Usa una tienda vacía (sin órdenes).',
        ordersCreated: 0,
        expensesCreated: 0,
      };
    }

    const productRepository = new ProductRepository(
      storeId,
      new ProductCategoryRepository(storeId),
    );
    const inventoryService = new InventoryOfflineService(storeId, productRepository);
    const expenseService = new ExpenseOfflineService(storeId);

    const specs: DemoProductSpec[] = [];
    for (const product of productRepository.getAvailableProducts()) {
      if (!product.availableToSale) continue;
      const { hasEntries, available } = inventoryService.getAvailableQuantity(product.id);
      // Only products backed by real inventory entries participate: sales need cost data
      // for the profit charts, and entries are what CSV imports with costo/cantidad create.
      if (hasEntries && available > 0) {
        specs.push({ id: product.id, price: product.price, available });
      }
    }

    if (specs.length === 0) {
      return {
        ok: false,
        message:
          'No hay productos con inventario para vender. Primero importa un CSV de productos con costo y cantidad (docs/csv/productos-mas-vendidos-cuba.csv).',
        ordersCreated: 0,
        expensesCreated: 0,
      };
    }

    const plan = buildDemoPlan(specs, new Date());

    // ── Orders (oldest first) ──────────────────────────────────────────────
    let ordersCreated = 0;
    for (const planned of plan.orders) {
      const orderItems: OrderItem[] = [];
      let total = 0;
      let itemsCount = 0;
      planned.items.forEach((entry, index) => {
        const product = productRepository.getProductById(entry.productId);
        if (!product) return;
        // FIFO cost resolution — same call the real sale flow uses (deducts stock and
        // returns the cost segments that feed the profit charts). Passed the real
        // product, so the flag gate behaves exactly like a sale with inventory.
        const productCosts = inventoryService.getAvailableInventoryCosts(
          product.id,
          entry.quantity,
          { product, hasInventoryModule: true },
        );
        orderItems.push(buildOrderItem(product, entry.quantity, index, productCosts));
        total = round2(total + product.price * entry.quantity);
        itemsCount += entry.quantity;
      });
      if (orderItems.length === 0) continue;

      const order: Order = {
        id: crypto.randomUUID(),
        orderItems,
        total,
        itemsCount,
        date: planned.date,
        type: OrderType.Normal,
        paymentType: planned.paymentType,
        isCredit: false,
        description: '',
        isActive: true,
        createdDate: planned.date,
        createdByName: 'demo-seed',
        updatedDate: undefined,
        updatedByName: undefined,
      };
      orderService.addImportedOrder(order);
      ordersCreated++;
    }

    // ── Expenses (monthly calendar from the plan) ──────────────────────────
    let expensesCreated = 0;
    for (const planned of plan.expenses) {
      const result = expenseService.create({
        type: planned.type,
        total: planned.total,
        date: planned.date,
        paymentType: planned.paymentType,
        note: planned.note,
      });
      if (result.succeeded) expensesCreated++;
    }

    return {
      ok: true,
      message: `Datos demo generados: ${ordersCreated} órdenes (90 días, sin créditos) y ${expensesCreated} gastos (salarios, transporte y mensuales). Recarga la app para ver los cambios.`,
      ordersCreated,
      expensesCreated,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Error generando datos demo: ${error instanceof Error ? error.message : String(error)}`,
      ordersCreated: 0,
      expensesCreated: 0,
    };
  }
}
