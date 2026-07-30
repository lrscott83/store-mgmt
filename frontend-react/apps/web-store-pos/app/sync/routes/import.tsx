import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { DataSerializerService } from '~/sync/lib/services/data-serializer-service';
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
    // Build serializer (read-only side) AND the category/product write side off the
    // SAME repository instances (product-sync-import-validation-parity, T1.5): product
    // category-exists validation during the merge below must observe categories written
    // by the SAME run's category merge — one `ProductCategoryRepository` instance = one
    // cache = guaranteed read-after-write consistency, mirroring Angular's singleton DI
    // (`ProductRepository`/`ProductCategoryRepository` are both `providedIn: 'root'`).
    // Inventory's read side reuses the same InventoryOfflineService instance the write
    // side constructs below (rule 12 — InventoryRepository has no Angular correlate,
    // deleted; serializer.import() never actually calls getInventoryEntriesJson(), only
    // serializer.export() does, so any valid instance satisfies the constructor — no
    // second instance needed).
    const categoryRepoForSerializer = new ProductCategoryRepository(storeId);
    const productRepoForSerializer = new ProductRepository(storeId, categoryRepoForSerializer);
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const orderSvc = new OrderOfflineService(storeId);
    const expenseSvc = new ExpenseOfflineService(storeId);
    const creditSvc = new SaleCreditOfflineService(storeId);

    const serializer = new DataSerializerService(
      storeId,
      categoryRepoForSerializer,
      productRepoForSerializer,
      inventorySvc,
      orderSvc,
      expenseSvc,
      creditSvc,
    );

    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    const payload = new Uint8Array(arrayBuffer);

    // Decrypt + parse — throws WrongPasswordError or CorruptFileError before any write
    const parsedData = await serializer.import(payload, password);

    // Build synchronizer (write side). Categories/Products route through the REAL
    // `ProductCategoryRepository`/`ProductRepository` — the SAME instances built above
    // for the serializer's read side (product-sync-import-validation-parity supersedes
    // the prior sync-local shim seam: the shim's generic name-uniqueness-only guard is
    // replaced by the repositories' full validation — category-exists, barcode-
    // uniqueness, per-category name-uniqueness, order-shift for products; name-
    // uniqueness + order-shift for categories).
    const categoryRepo = categoryRepoForSerializer;
    const productRepo = productRepoForSerializer;
    // Inventory + Orders + Expenses + SaleCredits route through their offline SERVICES
    // (Angular parity: the synchronizer calls inventorySvc.addImportedEntries/
    // updateImportedEntries, orderSvc.addImportedOrder/updateImportedOrder,
    // expenseSvc.addImportedExpense/updateImportedExpense, and
    // creditSvc.addImportedSaleCredit/updateImportedSaleCredit — never raw repos/shims;
    // order-sync-import-parity retires the last shim, `makeOrderRepoShim`). `inventorySvc`/
    // `orderSvc`/`creditSvc` are the SAME instances constructed above for the serializer's
    // read side (mirrors Angular's singleton DI; no second instance).

    const synchronizer = new DataSynchronizerService(
      storeId,
      categoryRepo,
      productRepo,
      inventorySvc,
      orderSvc,
      expenseSvc,
      creditSvc,
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
