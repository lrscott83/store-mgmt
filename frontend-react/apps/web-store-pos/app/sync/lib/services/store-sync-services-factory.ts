import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { ChannelRateOfflineService } from '~/management/channel-rates/lib/services/channel-rate-offline-service';
import { WarehouseOfflineService } from '~/inventory/lib/services/warehouse-offline-service';
import { RecipeOfflineService } from '~/inventory/lib/services/recipe-offline-service';
import { ElaborationOfflineService } from '~/inventory/lib/services/elaboration-offline-service';
import { StorePaymentMethodsConfigService } from '~/shared/lib/payment-methods/store-payment-methods-config-service';
import { MessagesOfflineService } from '~/shared/lib/messages/messages-offline-service';
import { CashClosingOfflineService } from '~/sales/lib/cash-closing/cash-closing-offline-service';
import { DataSerializerService } from './data-serializer-service';
import { DataSynchronizerService } from './data-synchronizer-service';

/**
 * multi-store-backup — the ONE place a store's read (serializer) and write
 * (synchronizer) services are wired, for ANY store id.
 *
 * Both sides share the SAME repository/service instances on purpose:
 * `ProductCategoryRepository` writes categories and `ProductRepository`
 * validates a product's category against it during the same import run, so one
 * instance per store is what guarantees read-after-write consistency (the
 * `product-sync-import-validation-parity` T1.5 contract, previously hand-wired
 * in `import.tsx`).
 *
 * The services encrypt/decrypt with the ACTIVE (storeId, DEK) pair, so callers
 * building services for a store that is not the selected one MUST wrap the call
 * in `withStoreDek(storeId, dek, ...)`.
 */
export interface StoreSyncServices {
  serializer: DataSerializerService;
  synchronizer: DataSynchronizerService;
}

export function createStoreSyncServices(storeId: string): StoreSyncServices {
  const categoryRepo = new ProductCategoryRepository(storeId);
  const productRepo = new ProductRepository(storeId, categoryRepo);
  const inventorySvc = new InventoryOfflineService(storeId, productRepo);
  const orderSvc = new OrderOfflineService(storeId);
  const expenseSvc = new ExpenseOfflineService(storeId);
  const creditSvc = new SaleCreditOfflineService(storeId);
  const channelRateSvc = new ChannelRateOfflineService(storeId);
  const warehouseSvc = new WarehouseOfflineService(storeId, productRepo, inventorySvc);
  const recipeSvc = new RecipeOfflineService(storeId, productRepo);
  const elaborationSvc = new ElaborationOfflineService(
    storeId,
    productRepo,
    recipeSvc,
    warehouseSvc,
    inventorySvc,
  );
  // store-payment-methods-backup: serves BOTH the serializer's read seam and
  // the synchronizer's write seam.
  const storePaymentMethodsSvc = new StorePaymentMethodsConfigService(storeId);
  // messaging-background-offline: serves both seams (read + append-only write).
  const messagesQueueSvc = new MessagesOfflineService(storeId);
  // cierre-efectivo: serves both seams (read + store-level fusion).
  const cashClosingSvc = new CashClosingOfflineService(storeId);

  return {
    serializer: new DataSerializerService(
      storeId,
      categoryRepo,
      productRepo,
      inventorySvc,
      orderSvc,
      expenseSvc,
      creditSvc,
      warehouseSvc,
      channelRateSvc,
      recipeSvc,
      elaborationSvc,
      storePaymentMethodsSvc,
      messagesQueueSvc,
      cashClosingSvc,
    ),
    synchronizer: new DataSynchronizerService(
      storeId,
      categoryRepo,
      productRepo,
      inventorySvc,
      orderSvc,
      expenseSvc,
      creditSvc,
      warehouseSvc,
      channelRateSvc,
      recipeSvc,
      elaborationSvc,
      storePaymentMethodsSvc,
      messagesQueueSvc,
      cashClosingSvc,
    ),
  };
}
