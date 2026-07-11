import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import {
  makeCategoryRepoShim,
  makeOrderRepoShim,
  makeProductRepoShim,
  makeSaleCreditRepoShim,
} from '~/sync/lib/storage/sync-repo-shims';
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
    // pass-through), not the offline services. Inventory's read side reuses the
    // same InventoryOfflineService instance the write side constructs below
    // (rule 12 — InventoryRepository has no Angular correlate, deleted; serializer.import()
    // never actually calls getInventoryEntriesJson(), only serializer.export() does, so any
    // valid instance satisfies the constructor — no second instance needed).
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

    // Build synchronizer (write side). Categories/Products go through sync-local storage
    // shims (not the read-oriented offline services), because the domain-validated
    // whole-type revert on a name clash needs a bulk map overwrite (`save`), which the
    // shims expose and the per-item offline-service wrappers do not. The shims re-home
    // the storage the removed `BaseRepository` used to provide (rule 12) without
    // reintroducing a shared base class — see `sync/lib/storage/sync-repo-shims.ts`.
    const categoryRepo = makeCategoryRepoShim();
    const productRepo = makeProductRepoShim();
    const orderRepo = makeOrderRepoShim();
    // Inventory + Expenses route through their offline SERVICES (Angular parity: the
    // synchronizer calls inventorySvc.addImportedEntries/updateImportedEntries and
    // expenseSvc.addImportedExpense/updateImportedExpense, not raw repos). `inventorySvc`
    // is the same instance constructed above for the serializer's read side (WU2).
    const saleCreditRepo = makeSaleCreditRepoShim();

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
