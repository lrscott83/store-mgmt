import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryRepository } from '~/inventory/lib/repositories/inventory-repository';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import type { Product, ProductCategory, Order, SaleCredit } from '@store-mgmt/domain';
import { DataSerializerService, WrongPasswordError, CorruptFileError } from '~/sync/lib/services/data-serializer-service';
import { DataSynchronizerService } from '~/sync/lib/services/data-synchronizer-service';
import { ImportForm } from '~/sync/components/import-form';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';

export const clientLoader = featureLoader([EFeatures.Receive]);

export function ImportPage() {
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  /**
   * Reads the file bytes, decrypts+parses the envelope, then runs the
   * synchronizer. Throws WrongPasswordError or CorruptFileError upstream
   * so ImportForm can display the correct error message.
   * The synchronizer is NOT invoked if serializer.import throws.
   */
  async function handleImport(file: File, password: string): Promise<SyncResult> {
    // Build serializer (read-only side). Categories/products are read via the
    // repositories directly (Angular parity, Flag #2 — raw stored-JSON
    // pass-through), not the offline services.
    const categoryRepoForSerializer = new ProductCategoryRepository(storeId);
    const productRepoForSerializer = new ProductRepository(storeId, categoryRepoForSerializer);
    const inventoryRepo = new InventoryRepository(storeId);
    const orderSvc = new OrderOfflineService(storeId);
    const expenseSvc = new ExpenseOfflineService(storeId);
    const creditSvc = new SaleCreditOfflineService(storeId);

    const serializer = new DataSerializerService(
      storeId,
      categoryRepoForSerializer,
      productRepoForSerializer,
      inventoryRepo,
      orderSvc,
      expenseSvc,
      creditSvc,
    );

    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    const payload = new Uint8Array(arrayBuffer);

    // Decrypt + parse — throws WrongPasswordError or CorruptFileError before any write
    const parsedData = await serializer.import(payload, password);

    // Build synchronizer (write side). Categories/Products go through the
    // raw BaseRepository (not the read-oriented offline services), because
    // the domain-validated whole-type revert on a name clash needs a bulk
    // map overwrite (`save`), which BaseRepository exposes and the
    // per-item offline-service wrappers do not.
    const categoryRepo = new BaseRepository<ProductCategory>('product-categories');
    const productRepo = new BaseRepository<Product>('products', ['createdDate', 'updatedDate']);
    const orderRepo = new BaseRepository<Order>('orders', ['date', 'createdDate', 'updatedDate']);
    // Inventory + Expenses route through their offline SERVICES (Angular parity: the
    // synchronizer calls inventorySvc.addImportedEntries/updateImportedEntries and
    // expenseSvc.addImportedExpense/updateImportedExpense, not raw repos).
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const saleCreditRepo = new BaseRepository<SaleCredit>('saleCredits', [
      'date',
      'paidDate',
      'createdDate',
      'updatedDate',
    ]);

    const synchronizer = new DataSynchronizerService(
      storeId,
      categoryRepo,
      productRepo,
      inventorySvc,
      orderRepo,
      expenseSvc,
      saleCreditRepo,
    );

    return synchronizer.sync(parsedData);
  }

  return (
    <div className="p-4">
      <ImportForm onImport={handleImport} />
    </div>
  );
}

export default ImportPage;
